/**
 * Id de cifra seguro para usar em `songs/{id}`: o mesmo formato que as regras
 * aceitam (`validId`) e fora dos ids reservados do Firestore (`__nome__`).
 */
export function isSongId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) && !/^__.*__$/.test(id);
}
