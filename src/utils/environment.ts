import { RokkaException } from '../exceptions';

export interface RokkaConfiguration {
	apiKey: string;
	organisation: string;
	activatedMimeTypes?: string[];
}

export function isRokkaActivated(logger: any) {
	if (process.env.ROKKA_DISABLED) {
		logger.info('Rokka link is disabled through environment variable.');
	}
	return !process.env.ROKKA_DISABLED;
}

export function getRokkaConfiguration(): RokkaConfiguration {
	const env = process.env;

	if (!env.ROKKA_API_KEY) {
		throw new RokkaException('Env variable ROKKA_API_KEY is not set', 500, 'ROKKA_MISCONFIGURED');
	}

	if (!env.ROKKA_ORGANISATION) {
		throw new RokkaException('Env variable ROKKA_ORG is not set', 500, 'ROKKA_MISCONFIGURED');
	}

	return {
		apiKey: env.ROKKA_API_KEY ?? '',
		organisation: env.ROKKA_ORGANISATION ?? '',
		activatedMimeTypes: env.ROKKA_MIME_TYPES ? env.ROKKA_MIME_TYPES.split(',') : undefined,
	};
}
