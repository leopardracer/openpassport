pragma circom 2.1.9;
include "../../../utils/crypto/signature/rsapss/rsapss3.circom";

template VerifyRsaPss3Sig_tester() {
    signal input modulus[35];
    signal input signature[35];
    signal input message[256];

    VerifyRsaPss3Sig(120, 35, 32, 256, 2048)(modulus,signature,message);
}

component main = VerifyRsaPss3Sig_tester();