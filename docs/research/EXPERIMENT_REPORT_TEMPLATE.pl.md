# Szablon raportu eksperymentu FacetKit

Użyj tego szablonu do udokumentowania eksperymentu. Protokół i kryteria należy ustalić przed uruchomieniem; nie zmieniaj ich po poznaniu wyników. Przed wysłaniem usuń instrukcje.

## Dane raportu

- **ID raportu:** `RPT-RRRRMMDD-INICJALY-01`
- **Data (UTC):**
- **Uczestnik / login:**
- **ID hipotezy i dokładna treść twierdzenia:**
- **ID Facetu i wersja / commit:**
- **ID karty z Banku zadań lub zadanie własne:**
- **Status:** zaplanowany / zakończony / przerwany

## Pytanie badawcze

Jaki obserwowalny efekt jest badany?

## Prognoza ustalona przed próbą

- **Oczekiwany efekt:**
- **Co będzie wspierać hipotezę:**
- **Co będzie przemawiać przeciw niej:**
- **Co oznacza wynik nierozstrzygający:**

## Warunki

| Zmienna | Baseline (próba bazowa) | Treatment (próba z Facetem) |
|---|---|---|
| Model i dokładna wersja | | |
| Instrukcje systemowe / developerskie | | |
| Narzędzia i uprawnienia | | |
| Facet / mechanizm | brak | obecny |
| Temperatura i inne ustawienia | | |
| Treść zadania | identyczna | identyczna |
| Kontekst / stan początkowy | | |

Wymień wszystkie różnice poza badanym mechanizmem i wyjaśnij, dlaczego były nieuniknione.

## Rubryka oceny (ustalona przed uruchomieniem)

| Kryterium | Definicja operacyjna | Waga | Wynik Baseline | Wynik Treatment |
|---|---|---:|---:|---:|
| Główny rezultat | | | | |
| Bezpieczeństwo / poprawność | | | | |
| Koszt / czas / tokeny | | | | |
| Skutki uboczne | | | | |

Skalę 0–1–2 z Banku zadań stosuj tylko wtedy, gdy pasuje: 0 = niespełnione, 1 = częściowo spełnione, 2 = spełnione. Dla każdej oceny określ obserwowalne kryteria. Wynik niedostępny lub nieprzeprowadzony oznacz jako **N/A**, nigdy jako zero ani zaliczenie.

## Próby i surowe dowody

| Próba | Warunek | Data/godzina | Link do wyniku / artefaktu | Uwagi |
|---|---|---|---|---|
| 1 | Baseline | | | |
| 1 | Treatment | | | |

Dołącz dokładne prompty, pełne odpowiedzi, istotne logi, konfigurację i notatki z oceny. Usuń sekrety i dane osobowe.

## Wyniki

- **Liczba zaplanowanych prób:**
- **Liczba ukończonych:**
- **Pominięte próby i przyczyny:**
- **Główny rezultat:**
- **Pozostałe rezultaty:**
- **Zaobserwowane błędy / nieoczekiwane zachowania:**
- **Koszty i skutki uboczne:**

## Wniosek

Wybierz: `SUPPORTED`, `NOT_SUPPORTED`, `MIXED`, `INCONCLUSIVE`, `NOT_REPLICATED`.

Uzasadnij wniosek w najwęższym zakresie, na jaki pozwalają dowody. Pojedyncza próba jest obserwacją pilotażową, a nie dowodem ogólnej skuteczności.

## Ograniczenia i odstępstwa

Opisz brakujące dane, wrażliwość na prompt, niepewność oceniającego, zmiany środowiska, odstępstwa od protokołu i możliwe czynniki zakłócające.

## Lista kontrolna powtarzalności

- [ ] Podano dokładną hipotezę i wersję Facetu
- [ ] Kryteria zapisano przed eksperymentem
- [ ] Udokumentowano warunki Baseline i Treatment
- [ ] Zachowano dokładne zadanie i odpowiedzi
- [ ] Ujawniono wszystkie próby, pominięcia i odstępstwa
- [ ] Uwzględniono koszty i skutki uboczne
- [ ] Dołączono lub podlinkowano pakiet dowodów
- [ ] Siła wniosku nie przekracza siły dowodów

## Recenzja

- **Recenzent:**
- **Data recenzji:**
- **Uwagi metodologiczne:**
- **Czy wymagana jest replikacja:** tak / nie
- **Decyzja:** przyjęto jako raport / wymaga poprawy / odrzucono jako nieważny (uzasadnienie)
