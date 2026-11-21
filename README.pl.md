# facetkit

<p align="center">
  <img src="docs/assets/banner.png" alt="facetkit — evidence-first engineering for teams of AI agents" width="220" />
</p>

[🇬🇧 English](README.md) | [🇵🇱 Polski]

[![npm](https://img.shields.io/npm/v/facetkit?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/facetkit)
[![License](https://img.shields.io/github/license/Anctoster/facetkit?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![GitHub Stars](https://img.shields.io/github/stars/Anctoster/facetkit?style=for-the-badge&logo=github)](https://github.com/Anctoster/facetkit/stargazers)

**Inżynieria oparta na dowodach dla zespołów agentów AI.** Umiejętności na tyle małe, że da się ich przestrzegać, narzędzia, które mierzą zamiast pytać, oraz dziennik, z którego wylicza się — a nie deklaruje — stan pracy, jej koszt i to, na ile można ufać wynikowi.

Bez zależności. Node 20+. Działa z każdym agentem, który potrafi uruchomić polecenie powłoki; dostępny jako wtyczka Claude Code. Analiza kodu rozumie JavaScript/TypeScript, Pythona, Go i Javę.

![FacetKit na jednym obrazku: zlecenie, kierownik, brygada, niezależny inspektor i odbiór; dziennik budowy pod każdym krokiem; poziomy zaufania L0–L4; wnioski poprawiają zasady](docs/assets/facetkit-explained.pl.svg)

![Jeden element pracy: specyfikacja, budowa, próba, dowód, bramka polityki — dowody przybywają, a poziom pewności rośnie](docs/assets/flow.svg)

> **Stan: 0.7.0, wersja eksperymentalna.** Narzędzia są przetestowane (liczba testów: <!-- count:tests -->255<!-- /count -->, liczba przypadków testu odporności: <!-- count:benchmark -->22<!-- /count -->; zestaw jest uruchamiany na samym sobie, zob. [docs/dogfood.md](docs/dogfood.md)). Umiejętności to **niesprawdzone hipotezy o zachowaniu agentów (liczba: <!-- count:untested -->69<!-- /count -->)** — wypisanych pojedynczo w [HYPOTHESES.md](HYPOTHESES.md), każda z próbą, która ją potwierdzi albo obali. Przeprowadzenie takiej próby to najcenniejszy wkład, jaki możesz wnieść.


## 🔬 Badania Społeczności

Pomóż nam odkryć, co naprawdę sprawia, że agenci AI  
stają się bardziej niezawodni, skuteczni i łatwiejsi do zweryfikowania.

Dołącz do Programu Badawczego Społeczności FacetKit.

[Program Badań Społeczności FacetKit](docs/research/README.pl.md)

## Od czego zacząć

**Nowy w FacetKit?** Trzy krótkie przewodniki, każdy do użycia osobno: **[Szybki start](docs/quick-start.pl.md)** — dziesięć minut na własnym kodzie, bez agentów → **[Włączenie do projektu](docs/project-integration.pl.md)** — jedna reguła dla własnego agenta albo tylko wybrani agenci (`facet init --agents slice-builder,proof-inspector`) → **[Integracja z GitHubem](docs/github-integration.pl.md)** — kontrola i komentarz na każdym pull requeście (`facet init --github`).

## Wypróbuj w pięć minut
```bash
git clone https://github.com/Anctoster/facetkit && cd facetkit
npm run demo:proof
npx facetkit demo
```

## Jaki problem rozwiązuje

Agent kończy pracę i mówi, że gotowe. Między tym zdaniem a wynikiem, na którym można polegać, jest kilka pytań, na które domyślnie nikt nie odpowiada:

- **Czy to sprawdzono, czy tylko stwierdzono?** Test, który przechodzi, mógł nigdy nie być w stanie zawieść. Agent-recenzent mógł zacytować raport wykonawcy.
- **Co się dzieje, gdy sesja urywa się w połowie zadania?** Następna czyta wszystko od nowa albo zgaduje.
- **Ile to kosztowało i czy tańszy model by wystarczył?** Nikt nie wie, więc wszystko działa na najdroższym.
- **Czy zespół się poprawia?** Prompty rosną po każdym incydencie i nikt nie pyta, czy dopisek pomógł.
- **Na ile mogę ufać wynikowi — i zespołowi?** „Wszystkie testy przechodzą” nie jest odpowiedzią.

Frameworki odpowiadają na to kolejnymi agentami, środowiskiem uruchomieniowym albo panelem ocen wystawianych przez model. facetkit odpowiada trzema prostymi rzeczami: **regułami z kontrolą i limitem**, **narzędziami, które wytwarzają dowody**, oraz **jednym dziennikiem tylko do dopisywania**, z którego wylicza się całą resztę.

## Co dostajesz

### 1. Umiejętności jako fasety

Umiejętność jest pocięta na **fasety**: każda to jedna reguła, najwyżej 170 słów, w czterech częściach — `Do` (co zrobić), `Check` (co może sprawdzić obserwator), `Stop` (liczba i co zrobić po jej osiągnięciu), `Why` (jakiemu błędowi zapobiega). Agent nie ładuje całych umiejętności, tylko **zestaw**: fasety potrzebne jego roli w danej fazie, z kilku umiejętności naraz, w budżecie słów.

```bash
facet list                                             # 14 umiejętności, 69 faset, z kosztem w słowach
facet compose --role spec-falsifier --phase red        # zestaw dla roli i fazy
facet compose --take slice-seams:contract-pin          # jedna dodatkowa reguła na żądanie
facet audit --prior ../inne-umiejetnosci               # budowa, duplikaty, podobieństwo do cudzych prac, budżety
```

| Umiejętność | Co zmienia |
|---|---|
| `spec-trace` | prośba staje się ponumerowanymi wymaganiami; sposób obalenia każdego ustala się przed testem; każdy test wskazuje wymaganie |
| `falsifiable-tests` | test liczy się dopiero wtedy, gdy zawiódł z właściwego powodu, przetrwał sabotaż i „zabił” mutanty |
| `slice-seams` | pionowy wycinek nie jest gotowy, póki nie przejdą testy sąsiadów, wspólny przykład kontraktu i jedna prawdziwa ścieżka |
| `thrift-loop` | polecenia idą przez licznik; wyjście zostaje na dysku; budżety są twardym stopem; praca trafia do najtańszego wystarczającego modelu |
| `anchored-handoff` | odwołania do kodu niosą skrót treści; odbiorca czyta ponownie tylko to, co się zmieniło |
| `doc-receipts` | dokumentację czyta się raz na wersję biblioteki i zostawia „paragon” |
| `evidence-browser` | dowód z przeglądarki to zestawienie liczb i naruszeń reguł, nie zrzut ekranu |
| `claim-ledger` | każde twierdzenie ma polecenie, które mogłoby je obalić |
| `journal-flow` | koordynator pyta, co dalej, zamiast pamiętać; praca wznawia się od punktów kontrolnych |
| `earned-memory` | zapisuj tylko to, co cię coś kosztowało; przypominaj według obszaru kodu; nieaktualne oznacza „sprawdź ponownie” |
| `hindsight-retro` | działaj tylko przy jednoznacznych dowodach; późne defekty obciążają źródło; każda zmiana przechodzi okres próbny |
| `assured-work` | element zamyka polityka; wyjątki to decyzje nazwanych osób; raporty podają poziom |
| `skill-sense` | najpierw diagnoza, potem zmiana reguły; reguły działające, lecz ignorowane, stają się narzędziami |
| `facet-forge` | jak dodawać, testować, mierzyć i wycofywać fasety |

### 2. Narzędzia, które mierzą

| Polecenie | Co daje agentowi |
|---|---|
| `facet run -- CMD` | kod wyjścia, linie sygnałowe, końcówkę; pełny log na dysku; wyjście 3, gdy budżet jest wyczerpany albo polecenie zawiodło trzy razy z rzędu |
| `facet trace --spec S --tests T` | wymagania, których nic nie weryfikuje; testy, które weryfikują coś, o co nikt nie prosił |
| `facet mutate --files F --test "CMD"` | ograniczona próba mutacyjna: których celowych usterek nie zauważył żaden test |
| `facet seams` | konsumenci, dostawcy i testy sąsiadów zmienianego kodu |
| `facet capsule seal\|verify` | odwołania do kodu zakotwiczone skrótem |
| `facet scan` | sekrety w dodanych liniach, zakazane ścieżki, nowe zależności, niebezpieczne polecenia, wstrzyknięte instrukcje |
| `facet atlas card PLIKI` | co plik udostępnia, kto używa której nazwy, jakie testy za nim stoją, co zmienia się razem z nim — w 220 słowach |

### 3. Jeden dziennik, wiele widoków

Każde polecenie czyta dziennik tylko do dopisywania, połączony łańcuchem skrótów, liczy i kończy pracę. Nie ma demona, bazy danych ani środowiska uruchomieniowego.

| Pytanie | Polecenie |
|---|---|
| Co mam teraz zrobić? | `facet flow next` — jedno działanie: agent, tryb, model, reguły. Kroków nie da się pominąć. |
| Sesja urwała się w połowie kroku. | ponownie `facet flow next` — dziesięciolinijkowa karta wznowienia z punktów kontrolnych (`facet note`) |
| Co zespół wie o tym kodzie? | `facet mem recall --files …` |
| Co się wydarzyło? Co wygląda źle? | `facet timeline` |
| Gdzie poszły tokeny? | `facet cost import TRANSKRYPT`, `facet cost report` |
| Który agent jest dobry na którym modelu? | `facet eval matrix`, `compare`, `replay`, `judge` |
| Jak się poprawiamy? | `facet retro report`, `hindsight`, `adopt` |
| **Które reguły działają, dlaczego i co z każdą zrobić?** | `facet skill report`, `facet skill coverage` |
| Czy zdążymy? | `facet plan` |
| **Czy element można zamknąć? Na ile można mu ufać?** | `facet assure`, `facet attest`, `facet trust` |
| Pokaż mi wszystko. | `facet board` — jedna samodzielna strona HTML |

## Na ile można ufać wynikowi?

Element zamyka **polityka nad zapisanymi dowodami**, a zamknięty element otrzymuje **poziom pewności**:

| Poziom | Co pokazuje zapis |
|---|---|
| L0 zadeklarowane | agenci zgłosili, że praca jest zrobiona |
| L1 odtworzone | agent, który nie wykonywał pracy, powtórzył kontrole; żadnego kroku nie pominięto; historia nietknięta; skan czysty |
| L2 wyspecyfikowane | każde wymaganie ma test albo scenariusz; kontrole projektu przechodzą na stanie końcowym |
| L3 falsyfikowane | co najmniej 80 % celowych usterek w zmienionym kodzie zauważyły testy; uruchomiono testy sąsiadów |
| L4 skalibrowane | niczego nie uchylono, a same kontrole wykazały, że wychwytują podrzucone defekty |

- Dowód zapisuje narzędzie, które zmierzyło — nigdy agent, którego praca jest oceniana — i dowód **traci ważność**, gdy kod zmieni się później.
- Wyjątek to **uchylenie w imieniu konkretnej osoby**: otwiera bramkę, ogranicza poziom i zostaje w atestacji.
- `facet trust` podaje dorobek zespołu z przedziałem — *„z 20 zamkniętych elementów 1 wymagał później poprawki; z około 80-procentową pewnością najwyżej 13 % ma defekt, który zostanie znaleziony później”* — oraz to, czy kontrole kiedykolwiek sprawdzono podrzuconym defektem (`facet canary`).

Poziom mówi, jakie dowody istnieją. Nie mówi, że wystarczają przy twoim ryzyku, i nie liczy defektów, których nikt nie znalazł. Zob. [docs/governance.md](docs/governance.md).

## Które umiejętności naprawdę działają?

Każda faseta jest hipotezą mierzoną na trzy sposoby: **ekspozycja** (czy reguła była w tym, co agent przeczytał, czy celowo ją wstrzymano), **przestrzeganie** (czy agent zostawił *ślad* reguły — użyte narzędzie, zapisany dowód, czerwony przebieg przed zielonym) oraz **efekt** (czy błąd, przed którym reguła chroni, zdarza się rzadziej). `facet skill report` stawia każdej diagnozę i przypisuje jedno działanie: zostawić, skrócić, zamienić w narzędzie, wycofać, przetestować. Zamierzony kierunek: kolekcja ma się z czasem *skracać*. Zob. [docs/skill-intelligence.md](docs/skill-intelligence.md).

## Nie tylko dla programistów

| Jesteś | Co dostajesz | Zacznij od |
|---|---|---|
| **testerem** | mapę ryzyka zmian z testami, których wymaga każdy obszar, i powodem; sesje eksploracyjne z limitem czasu; zgłoszenia błędów z odtworzeniem, które liczą się dopiero po potwierdzeniu przez drugi przebieg lub drugą osobę; poprawki, które muszą zostawić test nazywający błąd; GO/NO-GO z każdym powodem. Błąd w zamkniętej pracy jest „ucieczką” tego elementu, więc zaufanie do zespołu uczy się z tego, co znajdą testerzy. | [dla testerów](docs/for-testers.md), `facet qa`, wtyczka `qa-flow` |
| **architektem oprogramowania** | reguły architektury na grafie importów jako zapadka; zapisy decyzji z mierzonymi przewidywaniami (`facet decide check`); punkty zapalne i ukryte sprzężenia; trasa, która woła architekta, gdy zmiana okazuje się większa niż planowano | [dla architektów](docs/for-architects.md), `facet fitness`, `facet decide` |
| **architektem budynków** | produkcja w Archicadzie i wizualizacje prowadzone przez tanich agentów z briefem, mierzonymi kontrolami i niezależnym inspektorem; strona dla klienta po polsku | [dla architektów](docs/for-architects.md), wtyczki `arch-flow`, `viz-flow` |

## Kto co czyta

Ten sam zapis, opowiedziany osobie, która ma na jego podstawie działać:

| Jesteś | Uruchom | Dostajesz |
|---|---|---|
| programistą | `facet explain --for dev` | następne polecenie i to, czego jeszcze brakuje |
| liderem zespołu | `facet explain --for lead` | ile pracy wraca do poprawki i dlaczego, gdzie idą tokeny |
| klientem, właścicielem produktu | `facet explain --for client --lang pl --html status.html` | co jest gotowe i na ile zespół jest pewny — słowami |
| audytorem | `facet explain --for auditor`, `facet proof witness` | każdą regułę, wyjątek i podpis — oraz kontrole uruchomione ponownie przez ciebie |

## Co dodaje 0.7.0

- **Zapis ma autora**: paczki dowodowe (i opcjonalnie zdarzenia dziennika) są podpisywane kluczami Ed25519, którym projekt ufa według ról; paczka zmieniona i ponownie przeliczona jest TAMPERED.
- **Wynik jest odtworzony, nie zacytowany**: świadek uruchamia kontrole ponownie na tych samych źródłach; rozbieżność daje MISMATCH (`facet proof witness`).
- **Wstrzymany proces nie zepsuje dziennika**: blokady żyjącego właściciela nikt nie przejmuje; wymuszone przejęcie podnosi epokę, a spóźniony zapis ze starej epoki jest odsuwany (fencing).
- **Stan źródeł obejmuje to, od czego zależy wynik**: treść, bit wykonywalności, cel dowiązania, commit submodułu, zadeklarowane pliki ignorowane; środowisko pomiaru jest zapisywane razem z wynikiem.
- **Trasa dostosowuje się w trakcie pracy**: bardziej ryzykowna zmiana dodaje agentów i bramki, powracająca przyczyna wzmacnia reguły następnego agenta, słaby wynik na modelu podnosi model. Nigdy mniej kroków.
- **Przekazanie jest sprawdzane, gdy krok się kończy**: sekcje, dowody, nieaktualne kotwice, pliki zmienione, a niewymienione.
- **Funkcje dopasowania architektury** jako zapadka (`facet fitness`), **powtórki kontrfaktyczne** reguł na zakończonej pracy (`facet cf`), **nauka między projektami** (`facet learn export|import|pool`).

Odpowiedzi na przegląd 0.6.0: [docs/roadmap-0.7.0.md](docs/roadmap-0.7.0.md). Plan do wersji 2.0: [docs/roadmap-2.0.md](docs/roadmap-2.0.md).

## Wielu programistów, wiele zespołów

Dziennik może być katalogiem: **każdy piszący dopisuje wyłącznie do własnego segmentu**, więc dwa klony nigdy nie edytują tego samego pliku, a scalanie to kopiowanie plików — przez git, wspólny folder albo magazyn obiektów. Zdarzenia porządkuje zegar logiczny; każdy segment ma własny łańcuch skrótów; dwie osoby, które wzięły ten sam element, dowiedzą się o tym po scaleniu. Zob. [docs/architecture.md](docs/architecture.md).

## Jak zacząć

**Jako wtyczka Claude Code** (dziewięciu agentów, polecenia i umiejętności):

```text
/plugin marketplace add anctoster/facetkit
/plugin install facetkit@facetkit
```

Wtyczka nie zawiera kodu (to folder [`plugin/`](plugin/)). Polecenie `facet` pochodzi z npm — `npm i -g facetkit`, a gdy nie jest zainstalowane, agenci uruchamiają `npx --yes facetkit`.

**Jako polecenie** w dowolnym projekcie:

```bash
npx facetkit demo            # tablica z danych syntetycznych: jak wygląda system po kilku tygodniach
npx facetkit init --minimal  # facet.json, plik elementów, reguły i szablony (--claude kopiuje agentów i polecenia)
npx facetkit init --agents slice-builder,proof-inspector   # tylko wybrani agenci — zob. docs/project-integration.pl.md
npx facetkit init --github   # przebieg pull requestów dla GitHub Action — zob. docs/github-integration.pl.md
```

Najpierw wypróbuj narzędzia na własnym kodzie — bez przepływu i bez agentów:

```bash
facet atlas hotspots                                              # często zmieniane, szeroko używane, z testami lub bez
facet scan                                                        # na czym potknęłoby się twoje drzewo robocze
facet mutate --files src/price.py --test "pytest -q tests/"       # których celowych usterek nie zauważa żaden test
facet trace --spec SPEC.md --tests tests                          # wymagania, których nic nie weryfikuje
```

Potem daj jednemu agentowi jedną umiejętność („zanim napiszesz testy, uruchom `facet compose --take spec-trace,falsifiable-tests` i postępuj zgodnie z tym”), a na końcu przeprowadź cały element przez przepływ: `facet flow open`, `facet flow next`, …, `facet flow close` (z wtyczką: `/facetkit:facet-item ITEM-1`).

### Języki programowania

| | Graf importów, szwy, atlas | Próba mutacyjna | Śledzenie wymagań |
|---|---|---|---|
| JavaScript / TypeScript | importy względne i nazwane | wszystkie operatory | `*.test.*`, `*.spec.*` |
| Python | importy bezwzględne i względne, pakiety | operatory Pythona — z `pytest` lub dowolnym poleceniem | `test_*.py`, `*_test.py`, `tests/` |
| Go | ścieżka modułu z `go.mod`, pakiety jako katalogi | operatory zachowujące typy — z `go test` | `*_test.go` |
| Java | importy pod dowolnym katalogiem źródeł, `FooTest` ↔ `Foo` | operatory zachowujące typy | `*Test.java`, `src/test/` |

Umiejętności, dziennik, polityka i skan nie zależą od języka.

## Zespół

Dziewięć definicji agentów w `agents/`, trzy polecenia w `commands/`, reguły i szablony przekazań w `templates/`. Agenci odpowiadają w języku, w którym się do nich pisze.

| Agent | Co robi |
|---|---|
| `route-conductor` | otwiera i zamyka element: zlecenie, warunki stopu, budżet |
| `context-cartographer` | pakiet kontekstu: zakotwiczone fragmenty, zasięg zmiany, co już wiadomo |
| `blueprint-architect` | wiążące kontrakty i droga powrotu, zanim powstanie kod |
| `spec-falsifier` | specyfikacja → plan weryfikacji → czerwone testy; później mutanty i szwy |
| `red-first-specifier` | scenariusze akceptacyjne, widziane na czerwono z właściwego powodu |
| `slice-builder` | najmniejsza zielona zmiana, wycinek po wycinku |
| `release-pilot` | potoki, migracje, próba generalna, wycofanie |
| `proof-inspector` | uruchamia wszystko od nowa; PASS albo REWORK z przyczyną |
| `facet-warden` | pilnuje, by umiejętności było mało, były oryginalne i się opłacały |

Koordynator nie jest agentem: to główna sesja wykonująca `/facet-item`, która tylko pyta dziennik, co dalej.

## Gdzie to się przyda

facetkit powstał przy planowaniu 44-punktowej mapy drogowej aplikacji internetowej, ale nic w nim nie jest związane z tamtym projektem. Pasuje wszędzie tam, gdzie pracę dzieli się na elementy wykonywane przez więcej niż jednego agenta lub więcej niż jedną sesję:

- **zespoły produktowe korzystające z agentów**, które muszą pokazać recenzentowi lub klientowi, *dlaczego* zmianę przyjęto;
- **środowiska regulowane i audytowane**, gdzie po miesiącach trzeba umieć odpowiedzieć, kto zatwierdził wyjątek i na podstawie jakich dowodów;
- **opiekunowie projektów open source** otrzymujący zmiany pisane przez agentów: `facet scan`, `trace` i `mutate` jako dowody w CI;
- **badacze porównujący modele i prompty** na prawdziwych zadaniach: macierz agent × model, powtórki kroków, przekonania z przedziałami;
- **długie migracje i refaktoryzacje** rozciągnięte na dziesiątki sesji: karty wznowienia, harmonogram, punkty zapalne, ukryte sprzężenia;
- **dydaktyka**: fasety są na tyle krótkie, że można je czytać ze studentami, a każda ma próbę pokazującą błąd, któremu zapobiega.

Części działają osobno: same umiejętności bez dziennika, `facet mutate` i `facet trace` w dowolnym procesie testowym, `facet atlas` obok grafu składniowego, `facet scan` w haku pre-commit.

## Ograniczenia

- **Cztery języki, na wzorcach.** `seams`, `atlas` i `mutate` rozumieją JS/TS, Pythona, Go i Javę przez wyrażenia regularne, nie parsery: dynamiczne importy, refleksja i nietypowe konstrukcje umykają. W Go i Javie mutant, który się nie kompiluje, liczy się jako zauważony, więc używane są tylko operatory zachowujące typy, a wynik jest górnym oszacowaniem. Próbę dla Javy sprawdzono na etapie planowania mutantów, nie na prawdziwej kompilacji.
- **Brak prewencji.** facetkit nie izoluje i nie przechwytuje działań; odmawia *zamknięcia* pracy, która nie spełnia polityki. Do zapobiegania służą uprawnienia twojej platformy.
- **Zakłada uczciwość na brzegach.** Koordynator zgłasza końce kroków i liczbę tokenów. Dowody pisze narzędzie, ale koordynator z dostępem do powłoki mógłby dopisać zdarzenie ręcznie; łańcuch skrótów pokazuje edycję historii, nie kłamstwo dopisane na końcu. Obroną jest niezależna weryfikacja (`facet attest --verify`, ponowne uruchomienie kontroli w CI).
- **`mutate` to sonda, nie framework**: operatory tekstowe, bez wykrywania mutantów równoważnych, bez pokrycia.
- **`atlas` jest z założenia płytki**: bez grafu wywołań i rozwiązywania typów. Narzędzie takie jak [Graphify](https://github.com/Graphify-Labs/graphify) parsuje około czterdziestu języków i sięga głębiej; atlas dodaje to, czego składnia nie zawiera (wspólne zmiany, testy za plikiem, zakotwiczone wspomnienia zespołu) i odpowiada w stałym budżecie słów. Uzupełniają się.
- **Import kosztów** rozumie transkrypty Claude Code; przypisanie odbywa się według okna czasowego.
- **Tablica jest migawką**, nie widokiem na żywo.

## Czego nie udowodniono

- Prób zapisanych w każdym `SKILL.md` nie uruchomiono jeszcze na modelach. Do tego czasu każda faseta jest hipotezą — zob. [HYPOTHESES.md](HYPOTHESES.md).
- Przydział modeli, progi retrospektywy, okres połowicznego zaniku dowodów, założenia harmonogramu i próg 80 % zabitych mutantów to wartości domyślne przyjęte rozumowo, nie dostrojone na danych.
- Żaden projekt nie zamknął jeszcze elementów przez ten przepływ; stwierdzenia o zaufaniu były ćwiczone tylko w testach.
- Manifest wtyczki jest zgodny z opublikowanym układem, ale nie instalowano jej jeszcze z marketplace'u; przed użyciem uruchom `claude plugin validate plugin`.

Raporty z rzeczywistego użycia to najcenniejszy wkład: zob. [CONTRIBUTING.md](CONTRIBUTING.md).

## Źródła inspiracji

Zestaw powstał po przestudiowaniu poniższych projektów; nie zawiera ich tekstu: [obra/superpowers](https://github.com/obra/superpowers), [REMvisual/claude-handoff](https://github.com/REMvisual/claude-handoff), [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), [remotion-dev/skills](https://github.com/remotion-dev/skills), [firecrawl/skills](https://github.com/firecrawl/skills), [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli), [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents). Poziomy pewności inspirowane są poziomami łańcucha dostaw, takimi jak SLSA.

## Dokumentacja

Po polsku: [szybki start](docs/quick-start.pl.md) · [włączenie do projektu](docs/project-integration.pl.md) · [integracja z GitHubem](docs/github-integration.pl.md). Pozostała dokumentacja szczegółowa jest po angielsku: [jak to działa, według ról](docs/how-it-works.md) · [dla testerów](docs/for-testers.md) · [dla architektów](docs/for-architects.md) · [plan do 2.0](docs/roadmap-2.0.md) · [hipotezy](HYPOTHESES.md) · [raport z użycia na sobie](docs/dogfood.md) · [architektura](docs/architecture.md) · [polityka i poziomy](docs/governance.md) · [analityka umiejętności](docs/skill-intelligence.md) · [rozszerzenia](docs/extensions.md) · [jak wydać](RELEASING.md) · [jak współtworzyć](CONTRIBUTING.md) · [bezpieczeństwo](SECURITY.md)

## Licencja

MIT.
