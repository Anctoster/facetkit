# Wyniki badań FacetKit

**Wersja:** 0.2  
**Status:** Pierwsze kontrolowane próby  
**Ostatnia aktualizacja:** 2026-11-27

---

## 1. Przegląd

FacetKit zawiera zbiór hipotez behawioralnych, których celem jest poprawa niezawodności, skuteczności i weryfikowalności agentów AI.

Celem tej strony jest podsumowanie dowodów dostępnych obecnie dla tych hipotez.

Strona rozróżnia:

- sformułowane hipotezy;
- raporty obserwacyjne;
- kontrolowane eksperymenty;
- niezależne replikacje;
- oceny międzyprojektowe.

Hipoteza nie jest uznawana za potwierdzoną wyłącznie dlatego, że została zaimplementowana, opisana lub wykorzystana w pomyślnym procesie pracy.

**Aktualny stan badań odzwierciedla dowody dostępne w repozytorium, a nie liczbę funkcji zaimplementowanych w FacetKit.**

---

## 2. Aktualny stan badań

Poniższe podsumowanie odzwierciedla stan repozytorium sprawdzony 27 listopada 2026 r.

| Wskaźnik badawczy | Aktualny stan |
|---|---:|
| Hipotezy behawioralne | 69 |
| Hipotezy z zaraportowanymi próbami | 6 |
| Hipotezy ocenione w kontrolowanych eksperymentach | 6 |
| Hipotezy z niezależnymi replikacjami | 0 |
| Hipotezy z dowodami z wielu projektów | 0 |
| Hipotezy o ustalonej skuteczności | 0 |

Wartości te opisują aktualnie zarejestrowane dowody badawcze.

Nie oznaczają, że FacetKit nie ma praktycznej wartości.

Oznaczają, że skuteczność behawioralna jego hipotez nie została jeszcze ustalona w ramach procesu badawczego zdefiniowanego przez projekt.

---

## 3. Poziomy dojrzałości dowodów

FacetKit stosuje następujące poziomy do opisywania dojrzałości dowodów dotyczących hipotez behawioralnych.

| Poziom | Nazwa | Opis |
|---|---|---|
| E0 | Proposed | Hipoteza istnieje, ale nie była testowana |
| E1 | Observed | Zaobserwowano istotne zachowanie, ale brak kontrolowanego porównania |
| E2 | Tested | Udokumentowany eksperyment ocenił hipotezę |
| E3 | Replicated | Wynik został niezależnie odtworzony |
| E4 | Cross-Project | Wynik oceniono w wielu projektach lub środowiskach |

Poziomy te stanowią konwencję badawczą FacetKit.

Nie są uniwersalnym standardem naukowym i nie zastępują analizy statystycznej.

Dojrzałość dowodów należy oceniać zachowawczo.

Wyższy poziom dowodów nie musi oznaczać większego efektu ani wyższej wartości praktycznej.

---

## 4. Podsumowanie dowodów

Na podstawie aktualnego rejestru hipotez i dostępnych raportów eksperymentalnych:

| Poziom dowodów | Liczba hipotez |
|---|---:|
| E0 — Proposed | 63 |
| E1 — Observed | 0 |
| E2 — Tested | 6 |
| E3 — Replicated | 0 |
| E4 — Cross-Project | 0 |

Sześć przetestowanych hipotez to facety `spec-trace` (sekcja 5). Pozostają na poziomie E2: wszystkie dotychczasowe próby przeprowadziła jedna osoba, więc żadna nie jest niezależną replikacją. Raport terenowy z własnego użycia (sekcja 6) ma charakter obserwacyjny i nie stanowi kontrolowanego eksperymentu.

Nie należy zatem wykorzystywać go do twierdzenia, że skuteczność konkretnego Facetu została potwierdzona.

---

## 5. Wyniki według hipotez

Sześć hipotez ma kontrolowane próby na czterech modelach; pozostałe 63 mają status `UNTESTED`.

| Facet | GPT-6 | Claude Haiku 5.5 | Gemma 4 31B | Mistral Small 4 | Status |
|---|---|---|---|---|---|
| `spec-trace:numbered-clauses` | confirmed | confirmed | confirmed | no difference | `MIXED` — potwierdzone na 3 z 4 modeli |
| `spec-trace:sourced-clauses` | confirmed | confirmed | confirmed | no difference | `MIXED` — potwierdzone na 3 z 4 modeli |
| `spec-trace:verification-first` | confirmed | confirmed | no difference | no difference | `MIXED` — tylko mocniejsze modele |
| `spec-trace:claim-by-id` | confirmed | confirmed | no difference (częściowo) | no difference (częściowo) | `MIXED` — tylko mocniejsze modele |
| `spec-trace:example-replay` | confirmed | sufit | confirmed | no difference | `MIXED` |
| `spec-trace:spec-moves-first` | sufit | sufit | confirmed | confirmed | `MIXED` — tylko słabsze modele |

Każda komórka to 3 uruchomienia bez reguły i 3 z regułą, nowy czat przy każdym uruchomieniu, to samo zadanie na każdym modelu (24 zapisy prób, 24–26.11.2026). „Sufit”: kontrola już dała 3/3, więc próba nie mogła pokazać efektu. Zapisy: [`trials/results.json`](../../trials/results.json); widok według facetów: [`HYPOTHESES.md`](../../HYPOTHESES.md); metoda i wnioski: [raport z użycia](../field-report-2026-11.pl.md).


Źródłem prawdy w zakresie identyfikatorów i opisów hipotez jest rejestr:

[`HYPOTHESES.md`](../../HYPOTHESES.md)

### Status hipotezy

| Status | Znaczenie |
|---|---|
| `UNTESTED` | Brak zaraportowanego eksperymentu |
| `SUPPORTED` | Wyniki wspierają hipotezę w testowanych warunkach |
| `NOT_SUPPORTED` | Wyniki nie wspierają oczekiwanego efektu |
| `MIXED` | Wyniki różnią się w zależności od warunków |
| `INCONCLUSIVE` | Dowody są niewystarczające do sformułowania wiarygodnego wniosku |
| `NOT_REPLICATED` | Nie udało się odtworzyć wcześniej opublikowanego wyniku |

Status `SUPPORTED` nie oznacza, że hipoteza została uniwersalnie udowodniona.

Oznacza, że dostępny eksperyment wspiera hipotezę w udokumentowanym zakresie.

---

## 6. Raporty obserwacyjne

### 6.1. Raport terenowy 1

**Raport:** `field-1.json`  
**Typ:** Raport obserwacyjny / Dogfooding  
**Status:** Wstępny  
**Poziom dowodów:** E1 — Observed

Repozytorium zawiera wstępny raport terenowy dokumentujący wykorzystanie FacetKit w rzeczywistym kontekście programistycznym.

Raport obejmuje:

- 9 elementów kontekstu;
- 227 plików;
- 37 rekordów Facetów;
- 335 łącznych ekspozycji;
- 30 rekordów z wartością `withRule`;
- 0 celowo pominiętych Facetów.

Rozkład zarejestrowanych werdyktów:

| Werdykt | Liczba rekordów |
|---|---:|
| Unobservable | 10 |
| Ignored | 6 |
| Model-dependent | 1 |
| Followed / effect unknown | 7 |
| Thin | 13 |

Źródło:

[`trials/field/field-1.json`](../../trials/field/field-1.json)

### 6.2. Interpretacja

Raport dostarcza użytecznych informacji na temat praktycznej obserwowalności zachowania Facetów.

Nie dowodzi jednak, że FacetKit poprawił wyniki realizowanych zadań.

Raport nie zawiera kontrolowanego porównania równoważnych warunków bazowych i eksperymentalnych.

Brak celowo pominiętych Facetów oznacza również, że raport nie pozwala ustalić, czy zaobserwowane zachowanie zostało spowodowane przez testowane reguły.

Raport należy zatem traktować jako wstępny dowód obserwacyjny, a nie walidację skuteczności.

### 6.3. Wartość badawcza

Raport terenowy wskazuje kilka ważnych pytań badawczych:

- Które Facety wywołują obserwowalne zmiany zachowania?
- Które Facety są trudne do oceny?
- Jak często Facety są ignorowane?
- Które Facety wydają się zależne od modelu?
- Czy przestrzeganie Facetu poprawia końcowy wynik zadania?
- Czy można odróżnić jego wpływ od standardowego zachowania agenta?

Pytania te powinny pomóc w projektowaniu przyszłych kontrolowanych eksperymentów.

---

## 7. Kontrolowane eksperymenty

Pierwsze kontrolowane próby obejmują sześć facetów `spec-trace` na czterech modelach (sekcja 5). Główne wnioski: efekt reguły zależy od modelu w obu kierunkach — `spec-moves-first` pomogła tylko słabszym modelom, których mocniejsze nie potrzebowały; na słabszych modelach reguły często wykonywano tylko słowami (wymyślone źródła, wynik polecenia, którego nie uruchomiono) albo w połowie (`claim-by-id`: identyfikatory punktów przyjęte, testy bez punktu zostawione), dlatego reguły wymagające zapisanego znacznika powinny przejść w kontrole narzędziowe.

Kontrolowany eksperyment powinien obejmować:

- jednoznacznie wskazaną hipotezę;
- pytanie badawcze;
- warunki bazowe i eksperymentalne;
- wcześniej określone kryteria oceny;
- udokumentowane warunki wykonania;
- wyniki prób;
- interpretację zaobserwowanego efektu;
- ograniczenia.

Pierwsze kontrolowane eksperymenty powinny koncentrować się na hipotezach, których efekty można jasno zaobserwować.

Zobacz:

[`EXPERIMENT_PROTOCOL.md`](EXPERIMENT_PROTOCOL.md)

---

## 8. Status replikacji

Niezależna replikacja jest niezbędna do ustalenia, czy zgłoszony efekt można odtworzyć poza pierwotnym eksperymentem.

Aktualny stan:

| Wskaźnik replikacji | Stan |
|---|---:|
| Eksperymenty dostępne do replikacji | 6 |
| Zakończone niezależne replikacje | 0 |
| Zgłoszone nieudane replikacje | 0 |

Niepowodzenie replikacji nie jest powodem do usunięcia pierwotnego eksperymentu.

Zarówno wynik pierwotny, jak i wynik replikacji powinny pozostać dostępne do oceny.

---

## 9. Wyniki negatywne i mieszane

FacetKit zachęca do publikowania wyników, które podważają jego hipotezy.

Należy raportować między innymi sytuacje, w których:

- Facet nie wywołuje oczekiwanego efektu;
- Facet poprawia jeden wskaźnik, ale pogarsza inny;
- Facet działa tylko z określonymi modelami;
- Facet działa tylko dla określonych typów zadań;
- Facet zwiększa koszt bez istotnej poprawy;
- Facet powoduje nadmierne ograniczenia lub niepotrzebne zachowania;
- zaobserwowanego efektu nie można odtworzyć.

Wyniki negatywne i mieszane są niezbędne do identyfikacji rzeczywistych ograniczeń reguł behawioralnych.

Nie należy traktować ich jako nieudanych wkładów do projektu.

---

## 10. Znane ograniczenia badań

Aktualny stan badań ma kilka ograniczeń.

### 10.1. Ograniczona liczba kontrolowanych dowodów

Tylko 6 z 69 hipotez ma kontrolowane próby, wszystkie z jednej umiejętności (`spec-trace`), po 3 uruchomienia na warunek, w czatach webowych bez narzędzi — część reguł oparta na narzędziu (`facet trace`) nie była sprawdzana.

### 10.2. Ograniczona niezależna walidacja

Wszystkie 24 zapisy prób pochodzą od jednej osoby; niezależnej replikacji jeszcze nie zgłoszono.

### 10.3. Obserwowalność

Niektóre Facety mogą być trudne do oceny, ponieważ ich zamierzone efekty nie są bezpośrednio obserwowalne.

### 10.4. Zależność od modelu

Zachowanie agentów może różnić się w zależności od modelu, jego wersji i środowiska wykonawczego.

### 10.5. Stronniczość oceny

Automatyczna ocena lub ocena wykonywana przez model może wprowadzać stronniczość.

Metody oceny powinny być dokumentowane i poddawane przeglądowi.

### 10.6. Możliwość uogólnienia

Wynik uzyskany w jednym projekcie lub typie zadania nie powinien być automatycznie uogólniany na inne środowiska.

---

## 11. Priorytety badawcze

Kolejny etap badań FacetKit powinien koncentrować się na gromadzeniu wiarygodnych dowodów.

Kolejne próby, w tej kolejności (27.11.2026):

1. Claude Sonnet na tych samych sześciu zadaniach `spec-trace` — model, na którym działa większość kroków facetkit.
2. Te same facety w agencie z terminalem i dostępnym `facet trace`.
3. Trudniejsza pułapka dla dwóch sufitów na Claude Haiku (`spec-moves-first`, `example-replay`).
4. Pierwsze próby reguł, które facetkit kieruje najczęściej: `doc-receipts`, `anchored-handoff`, `claim-ledger:threshold-guard`.
5. Niezależna replikacja dowolnej potwierdzonej komórki przez drugą osobę.

Priorytety ogólne:

### Priorytet 1 — Ustanowienie procesu eksperymentalnego

Dopracowanie protokołu eksperymentów i szablonu raportowania.

### Priorytet 2 — Wybór pierwszych hipotez

Wybór niewielkiej liczby hipotez o jasno mierzalnych efektach behawioralnych.

### Priorytet 3 — Przeprowadzenie kontrolowanych eksperymentów

Porównanie warunków bazowych i eksperymentalnych w udokumentowanych okolicznościach.

### Priorytet 4 — Publikacja wszystkich wyników

Uwzględnianie wyników pozytywnych, negatywnych, mieszanych i nierozstrzygających.

### Priorytet 5 — Wspieranie niezależnych replikacji

Zapraszanie współtwórców do odtwarzania pierwszych opublikowanych eksperymentów.

### Priorytet 6 — Ocena skuteczności między projektami

Badanie, czy zgłoszone efekty pozostają spójne w różnych projektach, modelach i typach zadań.

---

## 12. Aktualizacja wyników

Ta strona podsumowuje dowody badawcze dostępne w repozytorium.

Raporty eksperymentów powinny być przechowywane osobno i powiązane z odpowiednią hipotezą lub podsumowaniem badań.

Podsumowanie należy aktualizować, gdy:

- zostanie zaakceptowany nowy eksperyment;
- eksperyment zostanie skorygowany;
- zakończy się replikacja;
- zmieni się klasyfikacja hipotezy;
- pojawią się nowe dowody z wielu projektów.

W miarę możliwości wartości podsumowania powinny być generowane na podstawie ustrukturyzowanych rekordów eksperymentów, zamiast być utrzymywane niezależnie.

Ogranicza to ryzyko rozbieżności między opublikowanym podsumowaniem a danymi źródłowymi.

---

## 13. Jak wziąć udział w badaniach?

Możesz pomóc rozbudować bazę dowodów poprzez:

- ocenę nieprzetestowanej hipotezy;
- przeprowadzenie kontrolowanego eksperymentu;
- replikację istniejącego wyniku;
- recenzję eksperymentu;
- doskonalenie metod oceny;
- zgłaszanie negatywnych lub nieoczekiwanych wyników.

Zacznij tutaj:

- [Research Hub](README.md)
- [Przewodnik dla współtwórców](CONTRIBUTOR_GUIDE.md)
- [Protokół eksperymentów](EXPERIMENT_PROTOCOL.md)
- [Hipotezy FacetKit](../../HYPOTHESES.md)

---

## 14. Rzetelność badań

Badania FacetKit stawiają na przejrzystość i możliwość odtworzenia wyników.

Projekt nie uznaje hipotezy za potwierdzoną wyłącznie dlatego, że:

- została zaimplementowana w frameworku;
- agent przestrzegał reguły;
- programista zaobserwował pozytywny rezultat;
- pojedyncze zadanie zakończyło się sukcesem;
- raport został zaakceptowany.

Siła wniosku musi być proporcjonalna do dostępnych dowodów.

Wyniki badań mogą się zmieniać wraz z pojawianiem się nowych eksperymentów i replikacji.

Korekty i aktualizacje powinny zachowywać historię wcześniejszych ustaleń.

---

## 15. Zasada badawcza

> FacetKit nie mierzy sukcesu liczbą zawartych w nim hipotez.
>
> Mierzy postęp ilością wiarygodnych dowodów zgromadzonych na temat zachowania agentów.

Celem programu badawczego jest ustalenie:

- które reguły behawioralne działają;
- które reguły nie działają;
- w jakich warunkach są skuteczne;
- jakie koszty lub skutki uboczne powodują;
- czy ich efekty można niezależnie odtworzyć.

**Celem tych badań nie jest potwierdzenie FacetKit. Celem jest jego zrozumienie.**
