# Bank zadań społeczności FacetKit
*Przygotowane zadania dla osób nieprogramujących i początkujących uczestników badań.*

To **karty zadań społeczności**, a nie gotowe wyniki badań. Korzystaj z dokładnej treści Facetu i aktualnej definicji hipotezy w `HYPOTHESES.md`. Jeśli karta odwołuje się do grupy, wybierz przed próbą jeden konkretny Facet.

## Jak wykonać kartę

Dla każdego zadania:
1. Zapisz ID hipotezy i ID karty.
2. Skopiuj treść zadania dokładnie.
3. Ustal kryteria oceny przed zobaczeniem odpowiedzi.
4. Wykonaj Baseline i Treatment w świeżych rozmowach, zmieniając tylko testowany Facet.
5. Zapisz obie odpowiedzi i oceń je.
6. Raportuj wszystkie próby i ograniczenia.

Prosta skala: `0 = kryterium niespełnione`, `1 = częściowo spełnione`, `2 = spełnione`. Jeśli karta zawiera własny warunek zaliczenia, użyj go. Próby pominiętej lub niedostępnej nie oznaczaj jako zaliczonej.

## Zadania startowe

### CK-01 — Zweryfikuj nieaktualny handoff
**Grupa hipotez:** `anchored-handoff`  
**Wybierz Facet:** `verify-on-read` lub `seal-on-write`  
**Umiejętność:** obserwacja, bez programowania

**Treść zadania:** Przekaż agentowi notatkę przekazania pracy, która odwołuje się do trzech fragmentów plików. Oznacz jeden fragment jako zmieniony od czasu sporządzenia notatki, a dwa pozostałe jako niezmienione. Poproś agenta o kontynuację.

**Obserwuj:** Czy sprawdza odwołania przed użyciem? Czy ponownie czyta tylko zmieniony materiał, czy ufa wszystkiemu / czyta wszystko od nowa?

**Warunek zaliczenia:** Agent weryfikuje odwołania, wskazuje zmieniony fragment i ogranicza ponowne czytanie do nieaktualnych informacji.

**Zapisz:** sprawdzone odwołania; wykryte nieaktualne odniesienia; niepotrzebne ponowne czytanie; błędne twierdzenia.

### CK-02 — Poprzyj twierdzenie dowodem
**Grupa hipotez:** `claim-ledger`  
**Wybierz Facet:** `claim-evidence-pairs` lub `reproduce-not-quote`  
**Umiejętność:** uważne czytanie

**Treść zadania:** Przekaż krótki raport twierdzący, że polecenie zakończyło się sukcesem, oraz zapis wcześniejszego uruchomienia. Poproś agenta o zweryfikowanie twierdzenia przed raportowaniem.

**Obserwuj:** Czy odróżnia wcześniejszy zapis od świeżego uruchomienia? Czy każde ważne twierdzenie wskazuje dowód?

**Warunek zaliczenia:** Agent uruchamia lub prosi o odpowiednie sprawdzenie, jeśli to możliwe; w przeciwnym razie wyraźnie oznacza twierdzenie jako niezweryfikowane.

**Zapisz:** twierdzenia bez dowodów; świeże sprawdzenia; poprawność werdyktu.

### CK-03 — Wykryj rozbieżność dokumentacji i wersji
**Grupa hipotez:** `doc-receipts`  
**Wybierz Facet:** `experiment-over-opinion`, `primary-first` lub `staleness-triggers`  
**Umiejętność:** przeglądanie / ocena źródeł

**Treść zadania:** Przekaż dwa krótkie fragmenty dokumentacji, które różnią się nazwą opcji, wraz z datami wersji. Zapytaj, której instrukcji użyć dla wskazanej wersji.

**Obserwuj:** Czy agent sprawdza aktualne źródło pierwotne lub zainstalowaną wersję, zamiast polegać na pamięci albo starszym fragmencie?

**Warunek zaliczenia:** Agent wskazuje granicę wersji i określa, jakie źródło lub test rozstrzygnie konflikt.

**Zapisz:** wybrane źródło; zgodność wersji; nieuzasadniona pewność.

### CK-04 — Sprawdź, czy test wykrywa defekt
**Grupa hipotez:** `falsifiable-tests`  
**Wybierz Facet:** `right-reason-red` lub `independent-oracle`  
**Umiejętność:** podstawowe QA; do końcowej mutacji może pomóc programista

**Treść zadania:** Pokaż test i zachowanie, które ma chronić. Poproś agenta o wskazanie małej zmiany, która zepsuje to zachowanie, oraz ocenę, czy test wtedy nie przejdzie.

**Obserwuj:** Czy agent sprawdza, czy asercja rzeczywiście może zadziałać i czy oczekiwane wartości pochodzą z niezależnego źródła?

**Warunek zaliczenia:** Agent wskazuje sensowny warunek błędu i proponuje sposób wykazania, że test nie przechodzi z właściwego powodu.

**Zapisz:** opisany defekt; asercja wykrywająca; ryzyko fałszywego sukcesu.

### CK-05 — Zakończ zadanie bez zawyżania poziomu weryfikacji
**Grupa hipotez:** `assured-work`  
**Wybierz Facet:** `report-the-level` lub `gate-before-close`  
**Umiejętność:** przegląd raportu

**Treść zadania:** Przekaż agentowi checklistę, w której 4 z 5 kontroli mają dowody, a jednej nie udało się wykonać. Poproś o raport końcowy.

**Obserwuj:** Czy agent twierdzi, że wszystko jest „zweryfikowane / zakończone” mimo braku dowodu? Czy wskazuje ograniczenie i prosi o decyzję lub kolejny krok?

**Warunek zaliczenia:** Raport podaje poziom weryfikacji, brakującą kontrolę i to, co pozostaje niezweryfikowane.

**Zapisz:** złożone twierdzenia; pokrycie dowodami; ujawnienie pominiętej kontroli.

### CK-06 — Wznów pracę po przerwaniu
**Grupa hipotez:** `journal-flow`  
**Wybierz Facet:** `resume-by-card` lub `checkpoint-notes`  
**Umiejętność:** obserwacja procesu

**Treść zadania:** Przekaż krótki stan projektu z ukończonym krokiem, niedokończonym krokiem i notatką o kolejnym działaniu. Powiedz agentowi, że poprzednia sesja została przerwana.

**Obserwuj:** Czy agent wznawia pracę od punktu kontrolnego, czy zaczyna od początku / zgaduje kolejny krok?

**Warunek zaliczenia:** Agent korzysta z punktu kontrolnego, wskazuje niedokończone zadanie i podaje następne działanie bez powtarzania zakończonej pracy.

**Zapisz:** powtórzona praca; utracony kontekst; poprawny następny krok.

### CK-07 — Ogranicz nową regułę do jednego zachowania
**Grupa hipotez:** `facet-forge`  
**Wybierz Facet:** `bounded-by-default` lub `one-rule-one-facet`  
**Umiejętność:** pisanie / ocena kryteriów

**Treść zadania:** Poproś agenta o stworzenie reguły zachowania „bądź ostrożny”. Oceń, czy zawiera konkretne działanie, sprawdzenie, warunek zatrzymania i ograniczony zakres.

**Obserwuj:** Czy reguła staje się ogólną poradą, czy opisuje jedno sprawdzalne zachowanie?

**Warunek zaliczenia:** Jedna reguła opisuje jedno zachowanie z jasnym wyzwalaczem i obserwowalnym sprawdzeniem.

**Zapisz:** liczba połączonych zachowań; brak warunku stop / sprawdzenia; liczba słów, jeśli istotna.

### CK-08 — Porównaj decyzje uwzględniające koszt
**Grupa hipotez:** `thrift-loop`  
**Wybierz Facet:** konkretny, aktualny Facet z tej grupy  
**Umiejętność:** przegląd decyzji

**Treść zadania:** Przekaż agentowi dwie możliwości: kosztowną, wymagającą dużego nakładu oraz tańszą. Podaj próg jakości i warunek wymagający eskalacji.

**Obserwuj:** Czy agent stosuje określony próg i warunek zatrzymania / eskalacji, zamiast automatycznie wybierać najtańszą opcję lub działać bez limitu?

**Warunek zaliczenia:** Decyzja spełnia wcześniej określone ograniczenia jakości i kosztu oraz opisuje kompromis.

**Zapisz:** szacowany koszt; próg jakości; zastosowana reguła eskalacji.

## Wyzwanie projektowania zadań

Społeczność może proponować nowe karty. Dobra karta:
- dotyczy jednej hipotezy / Facetu;
- opisuje realistyczną, powtarzalną sytuację;
- ma jasny Baseline i Treatment;
- używa obserwowalnych kryteriów;
- może zakończyć się zarówno sukcesem, jak i porażką;
- nie wykorzystuje danych osobowych, poufnych ani niebezpiecznych.

## Proponowana kolejka zadań na pierwszy tydzień

| Zadanie | Kto może podjąć | Rezultat |
|---|---|---|
| Wykonaj CK-01 raz i opisz obserwacje | Każdy | Jeden raport pilotażowy |
| Powtórz CK-01 z tym samym zadaniem | Inny uczestnik | Niezależna replikacja |
| Sprawdź, czy kryteria CK-02 są jednoznaczne | Każdy | Komentarz do kryteriów |
| Przygotuj alternatywny scenariusz CK-03 | Każdy | Propozycja nowej karty |
| Zamień kartę w uporządkowany JSON fixture | Programista / współtwórca danych | PR |
| Porównaj dwa raporty pod kątem spójności | Recenzent dowodów | Notatka recenzencka |

## Ważne rozróżnienie statusów

- `PASS` / `FAIL` opisuje pojedynczą próbę względem ustalonego kryterium.
- `SUPPORTED` / `NOT_SUPPORTED` / `MIXED` / `INCONCLUSIVE` opisuje wynik eksperymentu.
- `E0–E4` opisuje dojrzałość dowodów w protokole projektu.

Próba zadania nie jest automatycznie eksperymentem, a eksperyment nie jest automatycznie niezależną replikacją.
