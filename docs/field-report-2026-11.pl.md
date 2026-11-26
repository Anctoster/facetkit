# Raport z użycia, listopad 2026 — jeden prawdziwy projekt, dwanaście prób

[🇬🇧 English](field-report-2026-11.md) | [🇵🇱 Polski] · Zobacz też: [HYPOTHESES.md](../HYPOTHESES.md) · [Zestaw do prób](trial-kit.pl.md) · [facetkit na samym sobie](dogfood.md)

W ostatnim tygodniu listopada 2026 wydarzyły się dwie rzeczy: facetkit 0.8.0 przeprowadził poprawkę prawdziwego błędu od zgłoszenia do wydania na działającej stronie, a pierwsze dwanaście prób jego reguł uruchomiono na dwóch modelach. Ta strona opisuje jedno i drugie, zaczynając od liczb. Nie wymieniamy żadnego projektu ani osoby.

## 1. Jeden błąd, cały przepływ

**Projekt:** strona sprzedażowa osiedla mieszkaniowego (React 19, TypeScript, three.js; obrót widoku z lotu ptaka i przekrój 3D budynku). **Błąd:** przy obracaniu widoku z lotu ptaka obraz na kilka klatek robił się czarny; bez WebGL przekrój 3D zostawiał pustą stronę. Jeden element, prowadzony przez map → spec → red → design → build → probe → gates → proof → green → commit → close, na facetkit 0.8.0 z modelami Claude (Haiku, Sonnet, Opus zależnie od kroku).

**Wynik:** naprawione i wydane; bramka polityki ALLOW na poziomie L2 z jednym zapisanym wyjątkiem. 4 cykle poprawek (czwarty ponad domyślny limit 2, za zgodą właściciela), 205 uruchomień narzędzi (60 nieudanych), około 5 godzin pracy agentów. Dowody końcowe: 16/16 scenariuszy akceptacyjnych dwa razy z rzędu, 13/13 poprzedniego elementu, wynik mutacji 27/28 (96 %), każdy punkt specyfikacji pokryty.

**Co przepływ złapał, zanim trafiło do wydania:**

1. **Test, który nie mógł się nie udać.** Krok probe zbudował mutanta, który podmieniał klatkę bez czekania na `decode()` — dokładnie naprawiany błąd. Scenariusz-strażnik przeszedł na nim. Po wzmocnieniu ten sam scenariusz znalazł 10 niezdekodowanych klatek na 621 *w prawdziwym kodzie*: lukę w projekcie, nie tylko w teście.
2. **Regresję poprawki.** Czekanie na `decode()` zostawiało scenę pustą przez 161–254 ms na samym początku obrotu przy wolnym łączu. Scenariusz uruchomiony 3× na nowym kodzie i 3× na poprzednim commicie (osobne drzewo robocze) pokazał, że pada tylko na nowym kodzie.
3. **Połknięty błąd.** Jedna z dwóch ścieżek ignorowała odrzucone `decode()`, przez co klatka mogła zostać ukryta na zawsze. Znalazła to bramka przeglądu kodu; poprawka: obie ścieżki w jednej funkcji z testem jej trzech wyników.
4. **Niestabilne scenariusze.** Dwa scenariusze przechodziły dopiero za drugim razem. Zasada „przejście przy ponownej próbie to porażka” wymusiła deterministyczne okno zapisu zamiast obniżenia progu.
5. **Uczciwą historię czerwieni.** Przemianowany scenariusz, który sprawdzał teraz coś słabszego, nie dostał znacznika „widziany na czerwono” po starym; trzeba go było pokazać na czerwono jeszcze raz.

**Ile to kosztowało.** Mniej więcej jedna trzecia pytań do właściciela była formalna, nie o produkcie: sprawdzenie, czy krok build nie zmienił własnych testów, przypisywało mu testy napisane przez inne kroki (przy wszystkich 8 próbach build); zgody wygasały przy każdym ponownym starcie kroku; kontrola przekazania trzy razy padła na formatowaniu (dwukropek na końcu, tryb w nawiasie, kilka ścieżek w jednej linii); liczba tokenów ginęła, gdy raport przychodził po zamknięciu kroku; uruchomienia w tle z wcześniejszej próby kończyły się już po ponownym starcie kroku; dziennik większy niż limit skanu sekretów blokował zamknięcie; limit cykli poprawek dało się podnieść tylko edycją konfiguracji. Każda z tych rzeczy to poprawka narzędzia, nie nowa reguła; są na liście do następnego wydania.

## 2. Dwanaście prób: sześć reguł, dwa modele

Sześć facetów `spec-trace`, każdy 3 razy bez reguły i 3 razy z regułą, nowy czat przy każdym uruchomieniu, to samo zadanie na obu modelach. Modele: **GPT-6** (tak model sam się przedstawił; tryb gościa w przeglądarce nie pokazuje wyboru modelu) i **Mistral Small 4** (czat w przeglądarce).

| Facet | GPT-6 | Mistral Small 4 |
|---|---|---|
| `spec-moves-first` | no difference — **sufit**: kontrola już dała 3/3 | **confirmed** 0/3 → 2/3 |
| `numbered-clauses` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `sourced-clauses` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `verification-first` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `claim-by-id` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |
| `example-replay` | **confirmed** 0/3 → 3/3 | no difference 0 → 0 |

Każdy wynik jest w [`trials/results.json`](../trials/results.json) ze zgłoszeniem i transkryptami; [HYPOTHESES.md](../HYPOTHESES.md) pokazuje je dla każdego facetu.

**Czego się nauczyliśmy:**

1. **Wartość reguły zależy od modelu, w obie strony.** Pięć z sześciu reguł całkowicie zmieniło zachowanie mocniejszego modelu; słabszemu pomogła jedna z sześciu. I to właśnie ta, której mocniejszy model nie potrzebował.
2. **Teatr zgodności.** Z regułą słabszy model często wytwarzał *znaczniki* reguły bez jej *zachowania*: wymyślał cytaty-źródła dla testów, o które nikt nie prosił, wklejał `(verify: test)` i „false if” do kodu testów i wypełniał tabelę odtworzenia wynikiem polecenia, którego nie uruchomił („Listening on port 8080”), a potem zamykał zepsute zgłoszenie. Znacznik w tekście agenta nie jest dowodem. Dowodem jest pokwitowanie narzędzia — dlatego facetkit zapisuje dowody z narzędzi, nie z raportów.
3. **Skutki uboczne się liczą.** Przy niektórych regułach mocniejszy model zatrzymywał się, żeby pytać właściciela, choć wystarczyła zwykła poprawka — raz nie napisał żadnego testu. Kryterium zaliczenia tego nie widziało; zgłoszenie tak.
4. **Metoda.** Oceniaj według kryterium scenariusza zwykłymi słowami, nigdy według znaczników samej reguły (uruchomienie kontrolne ich nie zna). Najpierw kontrola; przy 3/3 podnieś pułapkę zamiast uruchamiać regułę. Podawaj model tak, jak pokazuje go narzędzie. 25 z 42 scenariuszy nadaje się do czatu; 17 wymaga agenta z terminalem; 13 facetów nie ma jeszcze scenariusza.

**Co to znaczy dla facetkit:**

- Werdykty są przechowywane osobno dla każdego modelu. Regułę wycofujemy dopiero wtedy, gdy słabszy model też nie pokazuje różnicy.
- Reguły, które proszą o zapisany znacznik, powinny przejść w narzędzia sprawdzające zachowanie (`skill-sense:graduate-to-tool`): źródło punktu sprawdzane z tekstem zlecenia, odtworzenie przyjmowane tylko z pokwitowaniem uruchomienia.
- Najważniejsze kolejne próby: na modelach, na których naprawdę działają agenci facetkit — Claude Haiku i Sonnet — oraz 17 scenariuszy z terminalem.

## Dołącz

Próba zajmuje około 40 minut i wymaga tylko okna czatu. Zacznij od [przykładu krok po kroku](running-a-trial.pl.md) i [zestawu do prób](trial-kit.pl.md), zarezerwuj facet w przypiętym zgłoszeniu Trial board i zgłoś wynik szablonem *Trial result*. „No difference” i „refuted” są tak samo mile widziane jak „confirmed”.
