import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const bits = (a << 16) | (b << 8) | c;
    encoded += alphabet[(bits >>> 18) & 0x3f] ?? "";
    encoded += alphabet[(bits >>> 12) & 0x3f] ?? "";
    encoded += hasB ? (alphabet[(bits >>> 6) & 0x3f] ?? "") : "=";
    encoded += hasC ? (alphabet[bits & 0x3f] ?? "") : "=";
  }
  return encoded;
}

export function decodeBase64(value: unknown): Result<Uint8Array, DomainError> {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return err(domainError("validation", "invalid canonical base64"));
  }

  const outputLength = value.length === 0 ? 0 : (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  const output = new Uint8Array(outputLength);
  let outputIndex = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = alphabet.indexOf(value[index] ?? "");
    const b = alphabet.indexOf(value[index + 1] ?? "");
    const cCharacter = value[index + 2] ?? "=";
    const dCharacter = value[index + 3] ?? "=";
    const c = cCharacter === "=" ? 0 : alphabet.indexOf(cCharacter);
    const d = dCharacter === "=" ? 0 : alphabet.indexOf(dCharacter);
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    if (outputIndex < output.length) output[outputIndex++] = (bits >>> 16) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = (bits >>> 8) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = bits & 0xff;
  }

  if (encodeBase64(output) !== value) {
    return err(domainError("validation", "invalid canonical base64"));
  }
  return ok(output);
}

