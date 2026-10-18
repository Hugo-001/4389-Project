// ============================================================================
// PLACEHOLDER: (FIDO2 verification).
// server.js calls these two functions and trusts their answer, so they must do
// the real cryptographic checks. Until then they throw, so the server refuses everyone.
//
// TODO(teammate): implement both. Each may be sync or async.
//
// verifyRegistration({ response, expectedChallenge, expectedOrigin, expectedRPID })
//   -> { verified: boolean, credential?: { id, publicKey, counter, transports? } }
//
// verifyAuthentication({ response, expectedChallenge, expectedOrigin, expectedRPID, credential })
//   -> { verified: boolean, newCounter?: number }
//
// `response` is the PublicKeyCredential JSON the browser sent (binary fields base64url).
// Hook it up by passing it to createServer({ verifier }) in src/index.js.
// ============================================================================
export const unimplementedVerifier = {
  async verifyRegistration() {
    throw new Error('FIDO2 verifier not configured');
  },
  async verifyAuthentication() {
    throw new Error('FIDO2 verifier not configured');
  },
};
