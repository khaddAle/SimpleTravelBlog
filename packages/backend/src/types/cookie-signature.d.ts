// cookie-signature@1.2.x ships no types resolvable under NodeNext, and the
// published @types stops at 1.1.x (a different export shape). Declare just the
// surface we use.
declare module 'cookie-signature' {
  export function sign(value: string, secret: string): string;
  export function unsign(input: string, secret: string): string | false;
  const cookieSignature: { sign: typeof sign; unsign: typeof unsign };
  export default cookieSignature;
}
