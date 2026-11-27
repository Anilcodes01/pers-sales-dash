"use client";
let version = 0;
export const recoveryEditVersion = () => version;
export function notifyRecoveryEdit() {
  version++;
  window.dispatchEvent(new Event("recovery-sheet-saved"));
}
