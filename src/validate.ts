export function validTimeout(timeout: number) {
  if (timeout < 10 || timeout > 60) {
    return false;
  }
  return true;
}
