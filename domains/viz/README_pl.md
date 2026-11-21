# viz-flow

**Kontrolowany proces pracy agentów przy przygotowywaniu grafiki na stronę sprzedażową**  
`Archicad → Blender → rendery → obrazy na stronę`

viz-flow adaptuje proces FacetKit (MIT), pierwotnie przeznaczony do tworzenia oprogramowania, do pracy ze scenami architektonicznymi i materiałami wizualnymi. Koordynuje agentów za pomocą briefu, dziennika projektu, niezależnych kontroli, akceptacji podglądu i rejestrowania uwag.

## Jak to działa

1. Zadanie jest otwierane jako **element pracy** w jednej z dostępnych ścieżek. Nowy projekt rozpoczyna się poleceniem `plan new-project`; po zmianie modelu użyj `plan model-change`.
2. Pierwszym krokiem każdego elementu pracy jest **brief**: oczekiwany rezultat, elementy, których nie wolno zmieniać, oraz maksymalnie 9 kryteriów akceptacji. Każde kryterium otrzymuje oznaczenie:
   - `[check]` — mierzone przez skrypt
   - `[look]` — oceniane wizualnie przez inspektora na jednym arkuszu podglądowym
   - `[user]` — decyzja należy do Ciebie

   Nieprecyzyjne briefy są odrzucane. Zatwierdzasz brief jeden raz, przed rozpoczęciem pracy.
3. Dziennik (`_viz/journal.jsonl` w folderze projektu) sam określa następny krok, agenta i model.
4. Niezależny inspektor ponownie uruchamia kontrole. Dziennik przyjmuje `PASS` tylko wtedy, gdy każda obowiązkowa kontrola zwróci `OK` w tym samym przebiegu. „Nie uruchomiono”, „pominięto” i „nie przeszło” blokują akceptację.
5. Przed kosztownym renderowaniem zatwierdzasz arkusz podglądowy.
6. Po zamknięciu elementu pracy każda uwaga jest zapisywana wraz z przyczyną: `agent` (kryterium istniało, ale nie zostało spełnione), `brief` (brief nie zawierał tego wymagania) lub `taste` (nowa preferencja). Uwaga staje się nowym elementem pracy, a wada — nową kontrolą.

Scena robocza, zatwierdzona biblioteka materiałów i oryginalny projekt Archicad nie są modyfikowane. Praca odbywa się na kopiach.

## Etapy nowego projektu

| Etap | Co sprawdzają skrypty |
|---|---|
| `export` — model z Archicad | Skala względem obiektu referencyjnego, położenie, identyfikatory elementów, nazwy powierzchni, duplikaty, rozmiar pliku |
| `environment` — istniejące otoczenie | Stopień i szczelina na styku z modelem terenu, dziury w terenie, tekstury |
| `materials` — materiały powierzchni | Zgodność z zatwierdzoną biblioteką, UV, rzeczywista skala tekstury |
| `cameras` — kamery i oblot | Obecność, obiekt w kadrze, clipping, obiektywy, równomierne rozmieszczenie kamer na oblocie |
| `render-setup` — ustawienia renderowania | Ustawienia zgodne z listą kontrolną; położenie słońca według lokalizacji, daty i godziny |
| `render`, `pack` | Liczba, wymiary i rozmiar klatek; czarne, prześwietlone, powtórzone lub brakujące klatki; szew oblotu |
| Każda edycja sceny | Wyłącznie zadeklarowane zmiany (`txn.contract`); odwrócone normalne, obiekty, obiekty bez podparcia, przecięcia, nieużywane dane |

Po zmianie modelu: `swap` (nowy model, te same materiały, kamery i słońce) → `env-adjust` (otoczenie zmienia się tylko w określonym obszarze) → `render` → `pack`.

Dodatkowe polecenia: `audit` — kontrola tylko do odczytu; `fix` — usuwanie wad.

Kryteria etapów, które można stosować niezależnie od sposobu połączenia Archicad i Blender, opisano w `skills/viz-item/scripts/STAGES.md`. Format briefu i przykład znajdują się w `skills/viz-item/references/brief.md`.

## Praca ze złożonymi modelami

Rozbudowane sceny powodują awarie gotowych agentów i wtyczek z podobnych powodów: agent próbuje „utrzymać całą scenę w głowie”, pojedyncze polecenie przechodzi przez całą scenę i zawiesza program, skrypty zależą od aktualnego zaznaczenia albo edycja jednego obiektu niepostrzeżenie przesuwa inny. viz-flow rozwiązuje te problemy przez organizację pracy, a nie instrukcje w promptach:

1. **Indeks zamiast sceny.** `scene_index.py` zapisuje jeden wiersz na obiekt: granice, strefy, materiały, modyfikatory, odciski geometrii i transformacje. Agenci odczytują indeks, a nie scenę. Przegląd ma limit czasu; niepełny indeks niczego nie dowodzi.
2. **Strefy.** Plan jest podzielony na komórki siatki (domyślnie 50 m). Edycja w dwóch strefach uruchamia ponownie kontrole tych stref oraz kontrole niezależne od położenia (słońce, ustawienia renderowania), zamiast sprawdzać całą scenę.
3. **Transakcje na kopiach kontrolnych.** Plik projektu nigdy nie jest edytowany w miejscu ani w otwartej sesji. Każda zmiana jest wykonywana w osobnym procesie Blender w tle przez `txn.py`: indeks → operacja → indeks → porównanie. Operacja z góry deklaruje, które obiekty i strefy może zmienić. Nowa kopia jest zapisywana tylko wtedy, gdy zmiany ograniczają się do zadeklarowanego zakresu; w przeciwnym razie nic nie zostaje zapisane, a poprzednia kopia służy jako punkt przywracania.
4. **Operacje niezależne od zaznaczenia.** Skrypty korzystają z API danych (`bpy.data`), a nie z operatorów interfejsu.
5. **Precyzja etapami.** Najpierw bryły zastępcze i zgrubny teren; kontrola położenia i styku, a dopiero potem detale w miejscach widocznych z kamery.
6. **Archicad partiami.** Eksport budynków według identyfikatorów elementów. Wymiana modelu zmienia wyłącznie obiekty z danej partii; reszta sceny nie jest importowana ponownie.

Więcej informacji: `skills/viz-item/scripts/COMPLEX.md`.

## Agenci

| Agent | Model | Zadanie |
|---|---|---|
| `viz-conductor` | Haiku | Przygotowuje brief; zadaje wszystkie pytania w jednej liście przed rozpoczęciem pracy |
| `scene-cartographer` | Haiku | Kontrola tylko do odczytu: dane liczbowe i wykrywanie wad sceny |
| `scene-operator` | Haiku | Uruchamia zarejestrowane skrypty partiami |
| `scene-builder` | Sonnet | Pisze i rejestruje skrypt etapu, gdy nie ma odpowiedniego gotowego skryptu; operator wykonuje następnie etap na Haiku |
| `viz-inspector` | Sonnet (Haiku dla kontroli liczbowych) | Niezależna kontrola, zapis wyników i wydanie werdyktu |

Po dwóch nieudanych próbach wykonania kroku model jest podnoszony o jeden poziom. Po udanym kroku wraca do poprzedniego poziomu.

## Ocena jakości agentów

`vizflow.py quality` przedstawia osobno:

- **Agentów** — dla każdej pary agent + model: w ilu elementach pracy inspektor zwrócił wynik oraz zalecenie: niezawodny, obserwować, podnieść model lub „za mało danych” (mniej niż 5 elementów pracy).
- **Inspektora** — w ilu zaakceptowanych elementach pracy później wykryto wadę.
- **Briefy** — ile uwag wynikało z brakującego kryterium i ile briefów zmieniono po zatwierdzeniu.
- **Obejścia procesu** — pominięte kontrole, wymuszone kroki, liczba rund podglądu i zużycie tokenów według modeli.

## Czy agenci się opłacają?

`vizflow.py efficiency [--lang ru|pl|en] [--html PLIK]` przedstawia dla każdego rodzaju zadania: odsetek poprawnych wyników za pierwszym razem, akceptację bez uwag, Twój czas w porównaniu z pracą ręczną, czas pracy agentów, tokeny i koszt, pytania i rundy podglądu, wady wykryte przez kontrole oraz model, który radzi sobie najlepiej.

Zapisujesz dwie wartości:

```bash
vizflow.py hand <ZADANIE> --hours H --by NAZWA
```
Zapisz, ile czasu zajęłoby wykonanie zadania ręcznie **przed** uruchomieniem agentów.

```bash
vizflow.py spent <ZADANIE> --minutes M --on review
```
Zapisz swój czas poświęcony na przegląd.

Szczegóły znajdują się w README arch-flow, w sekcji **„Czy agenci opłacają się w Twoich zadaniach?”**.

## Skrypty i testy własne

Wszystkie skrypty zostały napisane na potrzeby tego procesu; nie są używane zewnętrzne zestawy blender-skills.

`blender/selftest_blender.py` tworzy małą scenę w osobnym procesie Blender działającym w tle. Każda kontrola musi przejść tam, gdzie powinna, i nie przejść tam, gdzie nie powinna:

```bash
blender --background --factory-startup --python _viz/tools/blender/selftest_blender.py
```

Testy niewymagające Blendera:

```bash
python3 -m unittest discover -s tests
```

## Rozpoczęcie pracy

Powiedz: **„Wykonaj zadanie viz-flow: …”**  
Lub uruchom `/viz-item`.
