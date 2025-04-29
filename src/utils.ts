// src/utils.ts

/**
 * Wewnętrzna funkcja do kończenia procesu.
 * Umożliwia mockowanie w testach.
 * @param code - Kod wyjścia (domyślnie 1).
 */
export function _internalExit(code: number = 1): never {
  // Daj krótki czas transportom asynchronicznym na zapisanie logów
  // To nadal jest uproszczenie.
  setTimeout(() => {
    process.exit(code);
  }, 500).unref(); // unref(), aby nie blokować normalnego zamykania, jeśli nic innego nie działa

  // Aby zadowolić typ 'never', rzucamy błędem, chociaż proces powinien się zakończyć wcześniej.
  // W praktyce ten kod nie powinien zostać osiągnięty.
  throw new Error(`Exiting with code ${code}`);
}
