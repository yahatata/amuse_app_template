/**
 * registerForTournament の clientNonce / fingerprint
 */

import * as crypto from 'crypto';
import { throwTournamentHttpsError } from './tournamentHttpsError';

/** UUID 等を想定。注文側と同程度の上限 */
export const MAX_TOURNAMENT_CLIENT_NONCE_LENGTH = 128;

export const REGISTER_FOR_TOURNAMENT_OPERATION = 'register_for_tournament';

export function validateTournamentClientNonce(raw: unknown): string {
  if (typeof raw !== 'string') {
    throwTournamentHttpsError(
      'invalid-argument',
      'TOURNAMENT_NONCE_REQUIRED',
      'clientNonce must be a string',
    );
  }
  const clientNonce = raw.trim();
  if (!clientNonce) {
    throwTournamentHttpsError(
      'invalid-argument',
      'TOURNAMENT_NONCE_REQUIRED',
      'clientNonce is required',
    );
  }
  if (clientNonce.length > MAX_TOURNAMENT_CLIENT_NONCE_LENGTH) {
    throwTournamentHttpsError(
      'invalid-argument',
      'TOURNAMENT_NONCE_REQUIRED',
      'clientNonce is too long',
    );
  }
  if (!/^[A-Za-z0-9_.:-]+$/.test(clientNonce)) {
    throwTournamentHttpsError(
      'invalid-argument',
      'TOURNAMENT_NONCE_REQUIRED',
      'clientNonce has invalid characters',
    );
  }
  return clientNonce;
}

export function validateTournamentId(raw: unknown): string {
  if (typeof raw !== 'string') {
    throwTournamentHttpsError(
      'invalid-argument',
      'TOURNAMENT_INVALID_STATE',
      'tournamentId must be a string',
    );
  }
  const tournamentId = raw.trim();
  if (!tournamentId) {
    throwTournamentHttpsError(
      'invalid-argument',
      'TOURNAMENT_INVALID_STATE',
      'tournamentId is required',
    );
  }
  if (tournamentId.length > 256) {
    throwTournamentHttpsError(
      'invalid-argument',
      'TOURNAMENT_INVALID_STATE',
      'tournamentId is too long',
    );
  }
  return tournamentId;
}

/**
 * 正規化 fingerprint（キー順固定）。client 価格・表示名は含めない。
 */
export function buildRegisterForTournamentFingerprint(params: {
  tournamentId: string;
  uid: string;
  billId: string;
  businessDate: string;
}): string {
  const payload = {
    billId: params.billId,
    businessDate: params.businessDate,
    operation: REGISTER_FOR_TOURNAMENT_OPERATION,
    tournamentId: params.tournamentId,
    uid: params.uid,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildRegisterIdempotencyKey(billId: string, clientNonce: string): string {
  return `${billId}:registerForTournament:entry:${clientNonce}`;
}
