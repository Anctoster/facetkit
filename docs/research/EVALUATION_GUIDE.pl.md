# Przewodnik oceny eksperymentów FacetKit

Ten przewodnik ujednolica ocenianie przez ludzi. Uzupełnia Protokół eksperymentów i Bank zadań; nie zastępuje rubryki właściwej dla konkretnego zadania.

## 1. Opisuj zachowania, które można zaobserwować

Unikaj określeń takich jak „dobry”, „inteligentny” lub „zastosował Facet”. Zapisz, co oceniający może wskazać w odpowiedzi albo śladzie wykonania.

Słabo: „Odpowiedź jest wiarygodna”.  
Dobrze: „Każde twierdzenie faktograficzne ma poparcie w dostarczonym źródle albo jest wyraźnie oznaczone jako niezweryfikowane”.

## 2. Skalę 0–1–2 stosuj z jasnymi kryteriami

| Ocena | Znaczenie | Zasada ogólna |
|---:|---|---|
| 0 | Niespełnione | Wymagane zachowanie nie występuje lub jest mu przeciwne |
| 1 | Częściowo spełnione | Część zachowania występuje, ale pozostaje określona luka |
| 2 | Spełnione | Wszystkie określone wymagania są obserwowalne |

Dla każdego kryterium dodaj przykłady właściwe dla zadania. Nie wyprowadzaj oceny z tonu, pewności siebie, długości odpowiedzi ani własnych upodobań.

Użyj **N/A**, gdy kryterium nie da się ocenić. N/A nie oznacza zera i nie wolno po cichu pomijać go w mianowniku.

## 3. Rozdzielaj wymiary oceny

W zależności od zadania oceniaj niezależnie:
- poprawność i kompletność zadania;
- badane zachowanie;
- dowody i możliwość prześledzenia źródeł;
- bezpieczeństwo i zgodność z zasadami;
- koszt, czas i zużycie tokenów;
- niezamierzone skutki uboczne.

Poprawa jednego wymiaru nie kompensuje pogorszenia innego. Raportuj kompromisy.

## 4. Ślepa i niezależna ocena

Jeśli to możliwe:
1. Ukryj przed oceniającymi etykiety warunków (Baseline / Treatment).
2. Przekaż wszystkim tę samą rubrykę i dowody.
3. W przypadku ważnych lub subiektywnych kryteriów poproś co najmniej dwie osoby o niezależną ocenę.
4. Zachowaj pierwotne oceny przed dyskusją.
5. Zapisz rozbieżności i przyczyny ewentualnej decyzji rozstrzygającej.

Nie rozwiązuj rozbieżności przez automatyczne uśrednianie ocen porządkowych. Wyjaśnij przyjętą regułę.

## 5. Typowe błędy oceniania

- **Efekt retrospekcji:** zmiana rubryki po zobaczeniu wyników.
- **Efekt aureoli:** płynna odpowiedź otrzymuje wysoką ocenę poprawności bez sprawdzenia faktów.
- **Błąd potwierdzenia:** interpretowanie niejednoznacznego zachowania na korzyść hipotezy.
- **Przesuwanie kryteriów:** dodawanie wymagań, których nie ustalono wcześniej.
- **Selektywne raportowanie:** pomijanie nieudanych lub niewygodnych prób.
- **Pseudo-replikacja:** traktowanie kolejnych tur jednej rozmowy jako niezależnych prób.
- **Ujawnienie warunku:** oceniający rozpoznaje Treatment i jego oczekiwania wpływają na ocenę.

## 6. Zapewnij uczciwe porównanie

Utrzymuj możliwie stałe model i wersję, treść zadania, narzędzia, uprawnienia, kontekst, ustawienia i ograniczenia czasowe. Jeśli to możliwe, zmieniaj tylko badany mechanizm. Zapisuj nieuniknione różnice.

W systemach niedeterministycznych jedna próba rzadko wystarcza. Podaj liczbę prób i pełny rozkład lub wyniki poszczególnych prób; nie pokazuj wyłącznie najlepszego wyniku.

## 7. Raportuj niepewność

Rozróżniaj:
- zaobserwowany wynik;
- interpretację;
- możliwe alternatywne wyjaśnienia;
- ograniczenia;
- zakres wniosku.

Wynik może być użyteczny, nawet jeśli nie jest rozstrzygający. Użyj `INCONCLUSIVE`, gdy dane, wykonanie lub ocena nie pozwalają rozróżnić konkurencyjnych wyjaśnień.

## 8. Lista kontrolna recenzenta

- [ ] Kryteria są obserwowalne i ustalone przed próbą
- [ ] Kotwice skali są konkretne dla zadania
- [ ] N/A i brakujące dowody są jawnie opisane
- [ ] Raport obejmuje wszystkie próby i pominięcia
- [ ] Uwzględniono stronniczość i rozbieżności oceniających
- [ ] Raport obejmuje koszty i skutki uboczne
- [ ] Wnioski są proporcjonalne do dowodów
