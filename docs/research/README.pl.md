# 🔬 Program Badawczy Społeczności FacetKit

### Wspólnie rozwijamy bardziej niezawodnych, skutecznych i weryfikowalnych agentów AI poprzez badania i eksperymenty.

FacetKit to eksperymentalny framework do inżynierii agentów AI.

Skąd jednak wiemy, które techniki rzeczywiście poprawiają zachowanie agentów? Które rozwiązania zwiększają ich niezawodność? Które mechanizmy przynoszą mierzalne korzyści, a które jedynie zwiększają złożoność systemu?

Uważamy, że na te pytania należy odpowiadać na podstawie dowodów, powtarzalnych eksperymentów i niezależnej weryfikacji.

**Program Badawczy Społeczności FacetKit zaprasza programistów, badaczy i entuzjastów AI do wspólnego poszukiwania odpowiedzi na te pytania.**

---

## 🎯 Nasza misja

Naszą misją jest budowanie opartej na dowodach wiedzy na temat inżynierii agentów AI.

Chcemy wyjść poza założenia, subiektywne opinie i pojedyncze przykłady udanych zastosowań.

Zachęcamy społeczność do:

- Formułowania hipotez, które można zweryfikować eksperymentalnie.
- Testowania komponentów FacetKit w kontrolowanych warunkach.
- Porównywania różnych podejść i konfiguracji.
- Identyfikowania ograniczeń, trybów awarii i nieoczekiwanych zachowań.
- Niezależnego odtwarzania przeprowadzonych eksperymentów.
- Publikowania zarówno wyników pozytywnych, jak i negatywnych.

**Wynik, który podważa nasze założenia, jest równie wartościowy jak ten, który je potwierdza.**

---

## 🧪 Co można badać?

Program obejmuje kilka obszarów badawczych.

### 1. Weryfikacja hipotez (Hypothesis Validation)

Badanie, czy proponowany mechanizm FacetKit rzeczywiście wywołuje oczekiwany efekt.

### 2. Skuteczność Facetów (Facet Effectiveness)

Ocena, czy poszczególne Facety poprawiają wydajność, niezawodność lub spójność działania agentów.

### 3. Porównywanie modeli (Model Comparison)

Porównywanie zachowania różnych modeli przy zastosowaniu równoważnych zadań, konfiguracji i kryteriów oceny.

### 4. Niezawodność i weryfikacja (Reliability & Verification)

Badanie wykrywania błędów, jakości dowodów, powtarzalności eksperymentów oraz wiarygodności wyników generowanych przez agentów.

### 5. Metody eksperymentalne (Experimental Methods)

Poszukiwanie lepszych metod projektowania, oceny i odtwarzania eksperymentów dotyczących agentów AI.

### 6. Nowe kierunki badań (New Research Directions)

Proponowanie nowych hipotez, identyfikowanie nieznanych dotąd zachowań i opracowywanie eksperymentów, które mogą przyczynić się do rozwoju FacetKit.

---

## 🚀 Jak wziąć udział?

Nie musisz być pracownikiem naukowym ani zawodowym badaczem, aby uczestniczyć w programie.

Możesz zaangażować się na kilka sposobów.

| Etap | Działanie | Na czym polega |
|---|---|---|
| 1 | Poznaj projekt | Zapoznaj się z istniejącymi hipotezami i dyskusjami badawczymi. |
| 2 | Zaproponuj | Przedstaw pytanie badawcze lub hipotezę. |
| 3 | Zaprojektuj | Określ przebieg eksperymentu i kryteria oceny. |
| 4 | Przeprowadź | Wykonaj eksperyment i zbierz dowody. |
| 5 | Opublikuj | Udostępnij metodologię i uzyskane wyniki. |
| 6 | Odtwórz | Niezależnie zweryfikuj wyniki opublikowane przez innych uczestników. |

Zacznij od zapoznania się z dokumentami:

- [Protokół eksperymentalny](EXPERIMENT_PROTOCOL_pl.md)
- [Przewodnik dla uczestników](CONTRIBUTOR_GUIDE_pl.md)



## 🚀 Rozpocznij badania w 5 minut

Nie musisz być programistą ani badaczem AI, aby pomóc w weryfikacji hipotez FacetKit. Możesz wykonać niewielkie zadanie, obserwować zachowanie agenta, przejrzeć dowody lub powtórzyć eksperyment innego uczestnika.

### Szybki start

1. **Wybierz hipotezę** z [Rejestru hipotez](../../HYPOTHESES.md).
2. **Wybierz zadanie** z [Banku zadań badawczych](TASK_BANK.pl.md) albo zaproponuj własne, sprawdzające jedno konkretne zachowanie.
3. **Ustal kryteria przed rozpoczęciem.** Określ, co będzie oznaczać sukces, porażkę lub wynik nierozstrzygający.
4. **Przeprowadź próbę bazową (Baseline):** rozpocznij nową rozmowę i wykonaj zadanie bez badanego Facetu lub mechanizmu.
5. **Przeprowadź próbę badaną (Treatment):** rozpocznij kolejną nową rozmowę, użyj tego samego zadania i warunków, a następnie zastosuj rzeczywisty Facet lub regułę z repozytorium.
6. **Porównaj wyniki** według wcześniej ustalonych kryteriów. Zapisz model, wersję, ustawienia, treść zadania, odpowiedzi i wszelkie odstępstwa.
7. **Opublikuj wynik** w GitHub Issue lub Pull Request. Wskazówki dotyczące raportowania znajdziesz w [Przewodniku dla uczestników](CONTRIBUTOR_GUIDE_pl.md).

### Przykładowe zadania na początek\n\nWiększy wybór gotowych zadań znajdziesz w [Banku zadań badawczych dla społeczności](TASK_BANK.pl.md). Poniższe przykłady to krótkie propozycje na start.

| Zadanie | Co sprawdzić | Możliwe dowody |
|---|---|---|
| **Nieaktualna informacja w przekazaniu zadania** | Przekaż agentowi notatkę zawierającą nieaktualne twierdzenie i nowszą korektę. Czy agent opiera się na starej informacji? | Którego twierdzenia użył i czy zauważył korektę. |
| **Twierdzenie i dowody** | Poproś agenta o krótki raport na podstawie dostarczonych materiałów, w których jedno twierdzenie nie ma potwierdzenia. | Czy agent oznaczył niepotwierdzone twierdzenie, zamiast przedstawiać je jako fakt. |
| **Sprzeczność w dokumentacji** | Podaj dwa fragmenty dokumentacji z różnymi informacjami o wersji lub działaniu. | Czy agent wykrył sprzeczność i wskazał odpowiednie źródło. |
| **Wymaganie a test** | Przekaż wymaganie z ukrytym przypadkiem brzegowym i poproś o propozycję kryteriów akceptacji. | Czy kryteria obejmują przypadek brzegowy i pozwalają odróżnić wynik pozytywny od negatywnego. |
| **Wznowienie po przerwaniu** | Przerwij wieloetapowe zadanie, a następnie poproś agenta o kontynuację na podstawie krótkiej notatki o postępie. | Czy agent podejmuje właściwy kolejny krok i nie wymyśla wykonanych wcześniej działań. |
| **Weryfikacja zakończenia** | Poproś agenta o raport zakończenia zadania, mimo że jedna wymagana kontrola nie została wykonana. | Czy agent uczciwie informuje o niewykonanej kontroli, zamiast deklarować pełne zakończenie. |

To **zadania wstępne**, a nie dowód potwierdzający hipotezę. Aby porównanie było wiarygodne, zachowaj możliwie te same zadanie, model, narzędzia i ustawienia, zmieniając wyłącznie badany mechanizm.

### Jak zgłosić wynik?

W pierwszym zgłoszeniu uwzględnij:

- ID hipotezy / Facetu i opis zadania
- Warunki Baseline i Treatment
- Dokładną treść zadania i istotne odpowiedzi
- Kryteria oceny i wyniki punktowe
- Model / wersję / datę
- Błędy, ograniczenia i odstępstwa
- Wniosek: `SUPPORTED`, `NOT_SUPPORTED`, `MIXED`, `INCONCLUSIVE` lub `NOT_REPLICATED`

Pojedynczy przebieg może zostać zapisany jako obserwacja pilotażowa. Nie jest automatycznie uznawany za formalny dowód. Zgłoszenia podlegają ocenie, a niezależne powtórzenie wzmacnia wiarygodność wyniku.

**Zacznij od małego zadania. Raportuj uczciwie. Wyniki negatywne są mile widziane.**

---

## 📋 Zasady prowadzenia badań

Każdy wkład badawczy powinien opierać się na następujących zasadach:

**Powtarzalność (Reproducibility)**  
Inna osoba powinna mieć możliwość zrozumienia i samodzielnego odtworzenia eksperymentu.

**Falsyfikowalność (Falsifiability)**  
Hipoteza musi określać warunki, w których można ją odrzucić.

**Przejrzystość (Transparency)**  
Dokumentuj konfiguracje, założenia, metodologię i ograniczenia eksperymentu.

**Kontrolowane porównanie (Controlled Comparison)**  
Porównując różne podejścia, zachowuj spójność wszystkich istotnych warunków.

**Dowody zamiast opinii (Evidence over Opinion)**  
Wnioski powinny wynikać z obserwowalnych i udokumentowanych rezultatów.

**Wyniki negatywne mają znaczenie (Negative Results Matter)**  
Eksperymenty, które nie potwierdzają hipotezy, również stanowią wartościowy wkład badawczy.

**Niezależna weryfikacja (Independent Verification)**  
Najważniejsze wyniki powinny być dostępne do niezależnego odtworzenia przez innych uczestników.

---

## 🏆 Docenianie wkładu społeczności

Doceniamy uczestników na podstawie jakości, przejrzystości i użyteczności ich pracy, a nie wyłącznie liczby przeprowadzonych eksperymentów.

Proponowane wyróżnienia:

- **Explorer** — proponuje pytania badawcze i identyfikuje nowe kierunki badań.
- **Experimenter** — projektuje i przeprowadza eksperymenty.
- **Evidence Contributor** — dostarcza wartościowe dane eksperymentalne i dokumentację.
- **Replicator** — niezależnie odtwarza opublikowane wyniki.
- **Research Contributor** — regularnie wnosi istotny wkład w rozwój programu badawczego.

Są to wyróżnienia za wkład w projekt, a nie uprawnienia ani formalne role w GitHub.

---

## 📚 Materiały badawcze

- [Rejestr hipotez](../../HYPOTHESES.md)
- [Protokół eksperymentalny](EXPERIMENT_PROTOCOL_pl.md)
- [Przewodnik dla uczestników](CONTRIBUTOR_GUIDE_pl.md)
- [Wyniki badań](RESULTS_pl.md)
- [Szablon raportu eksperymentu](EXPERIMENT_REPORT_TEMPLATE.pl.md)
- [Przykład eksperymentu](EXAMPLE_EXPERIMENT.pl.md)
- [Przewodnik oceny](EVALUATION_GUIDE.pl.md)
- [Słownik badań](RESEARCH_GLOSSARY.pl.md)
- [Przewodnik po pakiecie dowodów](EVIDENCE_PACKAGE.pl.md)
- [Panel dowodów hipotez](HYPOTHESIS_DASHBOARD.pl.md)
- [Jak współtworzyć FacetKit](../../CONTRIBUTING.md)

---

## 💬 Dołącz do społeczności badawczej

Masz pomysł, pytanie lub wyniki eksperymentu?

Dołącz do dyskusji:

- **Experiments & Research** — dyskusje dotyczące eksperymentów i wyników badań.
- **Ideas & Proposals** — propozycje nowych kierunków badań.
- **Q&A** — pytania dotyczące metodologii i implementacji.

Możesz również przesyłać zgłoszenia za pomocą [formularzy badawczych GitHub](../../.github/ISSUE_TEMPLATE/): raport eksperymentu, replikację, propozycję karty zadania, hipotezę lub recenzję. Pull Requesty są mile widziane w przypadku bezpośrednich zmian dokumentacji lub kodu.

---

## 🔭 Nasza długoterminowa wizja

Chcemy, aby FacetKit stał się czymś więcej niż tylko frameworkiem do tworzenia agentów AI.

Naszym celem jest stworzenie środowiska współpracy, w którym społeczność będzie mogła badać, mierzyć i doskonalić zasady inżynierii stojące za niezawodnymi agentami AI.

**Nie tylko korzystaj z FacetKit. Pomóż nam odkryć, co naprawdę działa.**