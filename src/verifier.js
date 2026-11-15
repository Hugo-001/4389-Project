import {
    verifyRegistrationResponse,
    verifyAuthenticationResponse
} from '@simplewebauthn/server';

// Verifies a new FIDO2/WebAuthn registration response
async function verifyRegistration({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID
}) {
    try {
        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin,
            expectedRPID,
        });

        return {
            verified: verification.verified,
            credential: verification.registrationInfo?.credential
        };
    } catch (error) {
        console.error('Registration verification failed:', error);

        return {
            verified: false,
            error: error.message
        };
    }
}

// Verifies a FIDO2/WebAuthn login response
async function verifyAuthentication({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    credential
}) {
    try {
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin,
            expectedRPID,
            credential,
        });

        return {
            verified: verification.verified,
            newCounter: verification.authenticationInfo?.newCounter
        };
    } catch (error) {
        console.error('Authentication verification failed:', error);

        return {
            verified: false,
            error: error.message
        };
    }
}

// The real FIDO2 verifier, exported so the server (and tests) can use it.
export const verifier = { verifyRegistration, verifyAuthentication };
export const unimplementedVerifier = verifier;
