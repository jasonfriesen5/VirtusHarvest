// Compact public-domain SHA-256 (header-only) for the auth handshake.
// Signs of life: sha256(msg,len,out32).
#ifndef VIRTUS_SHA256_H
#define VIRTUS_SHA256_H
#include <stdint.h>
#include <string.h>

typedef struct { uint8_t data[64]; uint32_t datalen; uint64_t bitlen; uint32_t state[8]; } SHA256_CTX;

static const uint32_t _sha256_k[64] = {
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2 };

#define _R(a,b) (((a)>>(b))|((a)<<(32-(b))))
static void _sha256_transform(SHA256_CTX* c, const uint8_t* d){
  uint32_t i,j,t1,t2,m[64];
  uint32_t s0,s1,s2,s3,s4,s5,s6,s7;
  for(i=0,j=0;i<16;i++,j+=4) m[i]=(d[j]<<24)|(d[j+1]<<16)|(d[j+2]<<8)|(d[j+3]);
  for(;i<64;i++) m[i]=(_R(m[i-2],17)^_R(m[i-2],19)^(m[i-2]>>10))+m[i-7]+(_R(m[i-15],7)^_R(m[i-15],18)^(m[i-15]>>3))+m[i-16];
  s0=c->state[0];s1=c->state[1];s2=c->state[2];s3=c->state[3];
  s4=c->state[4];s5=c->state[5];s6=c->state[6];s7=c->state[7];
  for(i=0;i<64;i++){
    t1=s7+(_R(s4,6)^_R(s4,11)^_R(s4,25))+((s4&s5)^((~s4)&s6))+_sha256_k[i]+m[i];
    t2=(_R(s0,2)^_R(s0,13)^_R(s0,22))+((s0&s1)^(s0&s2)^(s1&s2));
    s7=s6;s6=s5;s5=s4;s4=s3+t1;s3=s2;s2=s1;s1=s0;s0=t1+t2;
  }
  c->state[0]+=s0;c->state[1]+=s1;c->state[2]+=s2;c->state[3]+=s3;
  c->state[4]+=s4;c->state[5]+=s5;c->state[6]+=s6;c->state[7]+=s7;
}
static void _sha256_init(SHA256_CTX* c){ c->datalen=0;c->bitlen=0;
  c->state[0]=0x6a09e667;c->state[1]=0xbb67ae85;c->state[2]=0x3c6ef372;c->state[3]=0xa54ff53a;
  c->state[4]=0x510e527f;c->state[5]=0x9b05688c;c->state[6]=0x1f83d9ab;c->state[7]=0x5be0cd19; }
static void _sha256_update(SHA256_CTX* c, const uint8_t* d, size_t len){
  for(size_t i=0;i<len;i++){ c->data[c->datalen++]=d[i];
    if(c->datalen==64){ _sha256_transform(c,c->data); c->bitlen+=512; c->datalen=0; } } }
static void _sha256_final(SHA256_CTX* c, uint8_t* h){
  uint32_t i=c->datalen; c->data[i++]=0x80;
  if(c->datalen<56){ while(i<56) c->data[i++]=0; }
  else { while(i<64) c->data[i++]=0; _sha256_transform(c,c->data); memset(c->data,0,56); }
  c->bitlen+=c->datalen*8; for(int k=7;k>=0;k--) c->data[56+k]=(uint8_t)(c->bitlen>>(8*(7-k)));
  _sha256_transform(c,c->data);
  for(i=0;i<4;i++){ for(int j=0;j<8;j++) h[i+j*4]=(uint8_t)(c->state[j]>>(24-i*8)); } }
static void sha256(const uint8_t* msg, size_t len, uint8_t out[32]){
  SHA256_CTX c; _sha256_init(&c); _sha256_update(&c,msg,len); _sha256_final(&c,out); }
#undef _R
#endif
