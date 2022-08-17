import rokka from 'rokka';
import { RokkaApi } from 'rokka/dist/apis';
import { Logger } from 'pino';
import { RokkaException } from '../exceptions';
import { getRokkaConfiguration, RokkaConfiguration } from '../utils/environment';
import { ROKKA_HASH_FIELD_NAME } from '../utils/config';
import { getStorage } from '../utils/storage';

const SUPPORTED_IMAGE_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/svg+xml',
	'image/tiff',
	'image/bmp',
	'application/pdf',
];

export class RokkaClientDirectus {
	rokkaApi: RokkaApi;
	rokkaConfiguration: RokkaConfiguration;

	constructor(private fileService: any, private logger: Logger) {
		this.rokkaConfiguration = getRokkaConfiguration();

		this.rokkaApi = rokka({
			apiKey: this.rokkaConfiguration.apiKey,
		});
	}

	public isSupported(mimeType: string) {
		return SUPPORTED_IMAGE_TYPES.includes(mimeType) && this.isMimeTypeActivated(mimeType);
	}

	private isMimeTypeActivated(mimeType: string) {
		return this.rokkaConfiguration.activatedMimeTypes
			? this.rokkaConfiguration.activatedMimeTypes.includes(mimeType)
			: true;
	}

	public async upload(record: any) {
		const storage = getStorage(record.payload.storage);

		const { exists } = await storage.exists(record.payload.filename_disk);

		if (!exists) {
			throw new RokkaException(
				`Image ${record.payload.filename_disk} does not exist on storage`,
				500,
				'ROKKA_FILE_MISSING'
			);
		}

		const stream = storage.getStream(record.payload.filename_disk);

		const response = await this.rokkaApi.sourceimages.create(
			this.rokkaConfiguration.organisation,
			record.payload.filename_download,
			stream
		);

		if (response.body.items && response.body.items.length > 0) {
			await this.storeRokkaHash(record.key, response.body.items[0]?.hash);
		}
	}

	public async delete(key: string) {
		const rokkaHashToDelete = await this.getHashToDelete(key);

		if (!rokkaHashToDelete) return;

		// If there are other files with the same hash -> do not delete on rokka
		if (await this.hasFilesWithSameRokkaHash(rokkaHashToDelete)) {
			this.logger.info('Skipping deletion of image on Rokka as there are other files with the same hash.');
			return;
		}

		this.logger.info('This file is the only once linked to Rokka. Deleting on Rokka.');
		const response = await this.rokkaApi.sourceimages.delete(this.rokkaConfiguration.organisation, rokkaHashToDelete);

		if (response.statusCode !== 204 && response.statusCode !== 404) {
			throw new RokkaException(response.message ?? 'UNKNOWN MESSAGE', 500, 'ROKKA_IMAGE_NOT_DELETED');
		}
	}

	private async storeRokkaHash(key: string, rokkaHash?: string | null) {
		if (!rokkaHash) return;

		return await this.fileService.updateOne(key, {
			[ROKKA_HASH_FIELD_NAME]: rokkaHash,
		});
	}

	private async getHashToDelete(key: string) {
		const file = await this.fileService.readOne(key);

		return file && file[ROKKA_HASH_FIELD_NAME] ? file[ROKKA_HASH_FIELD_NAME] : null;
	}

	private async hasFilesWithSameRokkaHash(rokkaHash: string) {
		const filesWithSameRokkaHash = await this.fileService.readByQuery({
			filter: {
				[ROKKA_HASH_FIELD_NAME]: {
					_eq: rokkaHash,
				},
			},
			aggregate: {
				count: ['*'],
			},
		});

		return filesWithSameRokkaHash[0]?.count > 1;
	}
}
