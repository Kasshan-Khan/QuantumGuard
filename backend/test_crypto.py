import oqs

print('liboqs successfully imported!')
signer = oqs.Signature('ML-DSA-65')
print('ML-DSA-65 signer initialized!')
print('Public key length:', len(signer.generate_keypair()))
