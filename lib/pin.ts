import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function isValidFourDigitPin(value: string) {
  return /^\d{4}$/.test(String(value || "").trim());
}

export function hashPin(pin: string) {
  const cleanPin = String(pin || "").trim();

  if (!isValidFourDigitPin(cleanPin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }

  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(cleanPin, salt, KEY_LENGTH).toString("hex");

  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, storedHash: string) {
  const cleanPin = String(pin || "").trim();
  const rawStored = String(storedHash || "").trim();

  if (!isValidFourDigitPin(cleanPin) || !rawStored) {
    return false;
  }

  const parts = rawStored.split(":");

  if (parts.length !== 2) {
    return false;
  }

  const [salt, savedHash] = parts;

  if (!salt || !savedHash) {
    return false;
  }

  const derivedHash = scryptSync(cleanPin, salt, KEY_LENGTH);
  const savedHashBuffer = Buffer.from(savedHash, "hex");

  if (derivedHash.length !== savedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedHash, savedHashBuffer);
}