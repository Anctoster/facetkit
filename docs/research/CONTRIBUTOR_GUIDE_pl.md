# Przewodnik dla współtwórców badań FacetKit

**Wersja:** 0.1  
**Status:** Wersja robocza  
**Program:** FacetKit Community Research

---

## 1. Wprowadzenie

FacetKit to eksperymentalny framework, który bada, w jaki sposób ustrukturyzowane reguły zachowania mogą poprawiać niezawodność, skuteczność i weryfikowalność agentów AI.

Projekt zawiera zbiór hipotez dotyczących zachowania agentów, nazywanych Facetami.

Hipotezy nie są jednak faktami.

Chcemy zbudować oparte na dowodach rozumienie tego, co rzeczywiście poprawia działanie agentów AI.

Program FacetKit Community Research zaprasza programistów, badaczy, inżynierów i entuzjastów AI do oceny tych hipotez za pomocą eksperymentów, obserwacji i niezależnych replikacji.

Nie musisz być głównym twórcą FacetKit, aby wziąć udział.

Potrzebujesz pytania badawczego, odpowiedniego zadania i gotowości do rzetelnego przedstawienia wyników.

---

## 2. Kto może wziąć udział?

Zapraszamy osoby o różnych doświadczeniach i specjalizacjach.

### Programiści

Oceniaj Facety podczas zadań związanych z tworzeniem oprogramowania. Raportuj ich wpływ na jakość implementacji, poprawność i zakres koniecznych poprawek.

### Badacze agentów AI

Analizuj hipotezy behawioralne, porównuj konfiguracje agentów i badaj warunki, w których określone Facety są skuteczne.

### Inżynierowie testów

Projektuj scenariusze oceny, identyfikuj przypadki niepowodzeń i poprawiaj wiarygodność procedur eksperymentalnych.

### Użytkownicy narzędzi AI

Testuj Facety w praktycznych procesach pracy i dokumentuj obserwacje z rzeczywistego użytkowania.

### Niezależni badacze

Powtarzaj istniejące eksperymenty, weryfikuj opublikowane wnioski lub badaj alternatywne wyjaśnienia.

Nie musisz pisać kodu, aby uczestniczyć w programie badawczym.

---

## 3. Sposoby uczestnictwa

Istnieje kilka sposobów wspierania badań FacetKit.

| Rodzaj wkładu | Opis |
|---|---|
| Experiment | Ocena hipotezy behawioralnej |
| Replication | Powtórzenie istniejącego eksperymentu |
| Review | Ocena metodologii lub raportu |
| Observation | Dokumentowanie istotnych zachowań agenta |
| Dataset Contribution | Udostępnienie odpowiednich, niepoufnych zadań testowych |
| Tooling | Udoskonalanie narzędzi badawczych i ewaluacyjnych |
| Documentation | Rozwijanie dokumentacji, przykładów i instrukcji |

### 3.1. Eksperymentator

Przeprowadź eksperyment oceniający wybrany Facet.

Twój wkład powinien obejmować jasne pytanie badawcze, warunki eksperymentu, kryteria oceny i wyniki.

### 3.2. Osoba replikująca eksperyment

Powtórz istniejący eksperyment w porównywalnych warunkach.

Replikacja przeprowadzona przez osobę inną niż autor pierwotnego badania ma szczególną wartość.

### 3.3. Recenzent

Oceń projekt eksperymentu, kryteria oceny i interpretację wyników.

Recenzent powinien koncentrować się na jakości badań, a nie na tym, czy wyniki wspierają FacetKit.

### 3.4. Programista

Udoskonalaj narzędzia ułatwiające przeprowadzanie, walidację i odtwarzanie eksperymentów.

Przykłady:

- szablony eksperymentów;
- walidacja wyników;
- automatyczna ewaluacja;
- generowanie raportów;
- śledzenie eksperymentów;
- narzędzia do odtwarzania badań.

---

## 4. Jak zacząć?

Zalecana ścieżka dla nowego współtwórcy:

```text
Zapoznaj się z Research Hub
          ↓
Wybierz hipotezę
          ↓
Przeczytaj protokół eksperymentów
          ↓
Przygotuj eksperyment
          ↓
Przeprowadź baseline i treatment
          ↓
Oceń wyniki
          ↓
Przygotuj raport
          ↓
Prześlij wkład
```

### Krok 1. Zapoznaj się z Research Hub

Zacznij od Research Hub FacetKit.

Poznaj cele badawcze projektu i aktualny zbiór hipotez.

### Krok 2. Wybierz hipotezę

Wybierz hipotezę z pliku:

[`HYPOTHESES.md`](../../HYPOTHESES.md)

Wybierz taką, którą można ocenić na podstawie obserwowalnego zachowania.

### Krok 3. Przeczytaj protokół eksperymentów

Przed rozpoczęciem eksperymentu przeczytaj:

[`EXPERIMENT_PROTOCOL.md`](EXPERIMENT_PROTOCOL.md)

Protokół opisuje sposób projektowania, przeprowadzania, oceniania i raportowania eksperymentów.

### Krok 4. Przygotuj eksperyment

Określ:

- pytanie badawcze;
- oczekiwany efekt;
- zadanie lub scenariusz;
- warunek bazowy;
- warunek eksperymentalny;
- kryteria oceny.

### Krok 5. Przeprowadź eksperyment

Wykonaj eksperyment zgodnie z udokumentowanym planem.

Zapisuj istotne wyniki, obserwacje, niepowodzenia i odstępstwa od planu.

### Krok 6. Prześlij wyniki

Przygotuj raport, korzystając z szablonu eksperymentu lub wymagań raportowania opisanych w Protokole eksperymentów.

---

## 5. Wybór hipotezy

Dobry pierwszy eksperyment powinien być stosunkowo prosty i umożliwiać jednoznaczną ocenę.

Wybierając hipotezę, zastanów się:

1. Czy oczekiwane zachowanie można zaobserwować?
2. Czy można je ocenić w spójny sposób?
3. Czy można określić warunek bazowy?
4. Czy eksperyment można przeprowadzić bez rozbudowanej infrastruktury?
5. Czy oczekiwany efekt ma znaczenie dla rzeczywistego zadania?

### 5.1. Zacznij od konkretnego pytania

Unikaj prób oceniania całej grupy Facetów jednocześnie.

Słabe pytanie badawcze:

> Czy FacetKit poprawia tworzenie oprogramowania?

Lepsze pytanie badawcze:

> Czy zastosowanie P03 zmniejsza liczbę błędnych założeń podczas implementacji niejednoznacznych wymagań programistycznych?

Konkretne pytanie ułatwia ustalenie, co spowodowało zaobserwowany wynik.

### 5.2. Nie wybieraj wyłącznie obiecujących hipotez

Hipoteza, która wydaje się mało prawdopodobna, również może być wartościowa do zbadania.

Badania nie powinny ograniczać się do potwierdzania istniejących oczekiwań.

---

## 6. Projektowanie eksperymentu

Każdy eksperyment powinien mieć udokumentowany projekt przed rozpoczęciem wykonania.

Co najmniej należy określić:

| Pole | Opis |
|---|---|
| Experiment ID | Unikalny identyfikator |
| Hypothesis ID | Badany Facet |
| Research Question | Co jest przedmiotem badania |
| Expected Effect | Oczekiwana zmiana zachowania |
| Scenario | Zadanie lub sytuacja |
| Baseline | Warunek bez badanego Facetu |
| Treatment | Warunek z zastosowanym Facetem |
| Metrics | Kryteria oceny wyniku |
| Trial Plan | Planowana liczba prób |
| Limitations | Znane ograniczenia |

### 6.1. Baseline

Baseline opisuje zachowanie agenta bez badanego Facetu.

### 6.2. Treatment

Treatment opisuje zachowanie agenta z zastosowanym Facetem.

W miarę możliwości pozostałe istotne warunki powinny być takie same.

### 6.3. Ocena

Przed rozpoczęciem eksperymentu określ, w jaki sposób będzie mierzony sukces.

Możliwe kryteria oceny:

- skuteczność zadania;
- zgodność z wymaganiami;
- liczba błędów;
- błędne założenia;
- zakres poprawek;
- czas wykonania;
- zużycie tokenów;
- koszt finansowy.

Nie każdy eksperyment wymaga wszystkich wskaźników.

Wybierz te, które są bezpośrednio związane z pytaniem badawczym.

---

## 7. Przeprowadzanie eksperymentu

Przed rozpoczęciem sprawdź, czy projekt eksperymentu jest wystarczająco szczegółowy.

Podczas wykonania zapisuj:

- dane wejściowe zadania;
- warunek eksperymentalny;
- istotne wyniki działania agenta;
- rezultaty oceny;
- próby nieudane lub niekompletne;
- odstępstwa od planu.

### 7.1. Wiele prób

Zachowanie agentów AI może różnić się między kolejnymi wykonaniami.

Jeżeli to możliwe, powtarzaj eksperyment lub wykorzystuj kilka porównywalnych zadań.

Nie raportuj wyłącznie najbardziej korzystnych wyników.

### 7.2. Nieudane próby

Nieudane próby są częścią dokumentacji badania.

Jeżeli próba zostaje wykluczona, wyjaśnij dlaczego.

Nie usuwaj po cichu wyników, które są niekorzystne.

### 7.3. Zmiany w eksperymencie

Jeżeli zmienisz eksperyment po rozpoczęciu wykonania, udokumentuj tę zmianę.

Jeżeli wpływa ona na pytanie badawcze lub kryteria oceny, rozważ potraktowanie zmodyfikowanego badania jako osobnego eksperymentu.

---

## 8. Raportowanie wyników

Każdy zakończony eksperyment powinien mieć raport.

Raport powinien zawierać:

### Informacje o eksperymencie

- identyfikator eksperymentu;
- identyfikator hipotezy;
- współtwórcę;
- datę;
- wersję lub commit FacetKit;
- model i jego wersję;
- istotne informacje o środowisku.

### Projekt eksperymentu

- pytanie badawcze;
- oczekiwany efekt;
- baseline;
- treatment;
- kryteria oceny;
- planowaną liczbę prób.

### Przebieg

- zakończone próby;
- nieudane próby;
- wykluczone próby i przyczyny;
- istotne obserwacje;
- odstępstwa od planu.

### Wyniki

- zaobserwowane rezultaty;
- wartości wskaźników;
- porównanie baseline i treatment;
- klasyfikację wyniku.

### Interpretacja

Wyjaśnij:

- co wskazują wyniki;
- czy hipoteza została wsparta;
- jakie ograniczenia mają zastosowanie;
- jakie alternatywne wyjaśnienia pozostają możliwe;
- co warto zbadać w następnej kolejności.

Oddziel zaobserwowane dane od własnej interpretacji.

---

## 9. Klasyfikacja wyników

Stosuj jedną z poniższych klasyfikacji.

| Wynik | Znaczenie |
|---|---|
| `SUPPORTED` | Wyniki wspierają hipotezę w testowanych warunkach |
| `NOT_SUPPORTED` | Wyniki nie wspierają oczekiwanego efektu |
| `MIXED` | Wyniki różnią się w zależności od warunków |
| `INCONCLUSIVE` | Brakuje dowodów do sformułowania wiarygodnego wniosku |
| `NOT_REPLICATED` | Nie udało się odtworzyć wcześniej opublikowanego wyniku |

Status `SUPPORTED` nie oznacza, że hipoteza została uniwersalnie udowodniona.

Pojedynczy eksperyment może dostarczyć wartościowych dowodów, ale nie musi potwierdzać ogólnej skuteczności.

---

## 10. Przesyłanie wkładu

Wyniki badań należy przesyłać zgodnie z aktualnie przyjętym procesem zgłaszania wkładu w projekcie.

W przypadku zgłoszeń przez GitHub zalecana procedura wygląda następująco:

1. Utwórz fork repozytorium FacetKit.
2. Utwórz gałąź dla swojego wkładu.
3. Dodaj raport z eksperymentu i pliki pomocnicze.
4. Sprawdź, czy nie zawierają poufnych ani wrażliwych informacji.
5. Otwórz Pull Request.
6. Opisz pytanie badawcze i najważniejsze wnioski.
7. Odpowiedz na uwagi recenzentów.

### 10.1. Proponowana struktura eksperymentu

Eksperyment społeczności może korzystać z następującej struktury:

```text
trials/
└── community/
    └── experiment-001/
        ├── README.md
        ├── experiment.json
        └── results.json
```

Dokładna struktura może ewoluować wraz z rozwojem narzędzi badawczych.

Przy zgłaszaniu wkładu stosuj aktualne konwencje repozytorium.

### 10.2. Opis Pull Request

Pull Request powinien krótko wyjaśniać:

- która hipoteza była oceniana;
- jakie pytanie badawcze analizowano;
- jak przeprowadzono eksperyment;
- jakie były wyniki;
- jakie pliki zostały dołączone;
- czy eksperyment jest replikacją.

---

## 11. Recenzja badań

Zgłoszone eksperymenty mogą być oceniane pod kątem:

- jasności pytania badawczego;
- spójności projektu eksperymentu;
- adekwatności warunku bazowego;
- trafności kryteriów oceny;
- kompletności raportu;
- powtarzalności;
- właściwej interpretacji;
- przejrzystości ograniczeń.

Eksperyment może zostać zaakceptowany również wtedy, gdy hipoteza nie została potwierdzona.

Recenzja ocenia jakość i przejrzystość badania.

Nie wymaga pozytywnego wyniku.

### 11.1. Prośby o poprawki

Recenzenci mogą poprosić współtwórców o:

- doprecyzowanie projektu eksperymentu;
- uzupełnienie brakujących informacji;
- wyjaśnienie wykluczonych prób;
- poprawę kryteriów oceny;
- ograniczenie zbyt daleko idących wniosków;
- opisanie ograniczeń.

Warto traktować recenzję jako wspólny proces badawczy.

---

## 12. Rzetelność badań

Badania FacetKit stawiają rzetelność ponad promocję projektu.

Współtwórcy nie mogą:

- fabrykować wyników;
- modyfikować danych eksperymentalnych;
- ukrywać istotnych niepowodzeń;
- wybiórczo raportować korzystnych prób;
- deklarować replikacji bez jej przeprowadzenia;
- przedstawiać obserwacji jako kontrolowanego eksperymentu;
- formułować wniosków wykraczających poza dostępne dowody.

Wyniki negatywne, mieszane i nierozstrzygające są mile widziane.

Dobrze udokumentowany eksperyment, który podważa hipotezę dotyczącą Facetu, może być bardziej wartościowy niż badanie, które jedynie potwierdza oczekiwania.

---

## 13. Prywatność i bezpieczeństwo

Nie przesyłaj:

- kluczy API;
- haseł;
- tokenów dostępu;
- prywatnych instrukcji systemowych;
- poufnego kodu źródłowego;
- danych osobowych użytkowników;
- wrażliwych informacji projektowych.

Jeżeli eksperyment wykorzystuje prywatne lub zastrzeżone dane, przygotuj ich zanonimizowany opis albo odpowiedni, niepoufny scenariusz testowy.

Eksperymenty obejmujące systemy zewnętrzne lub potencjalnie destrukcyjne działania muszą korzystać z odpowiednich zabezpieczeń.

FacetKit nie powinien być traktowany jako środowisko izolacji bezpieczeństwa (sandbox).

---

## 14. Uznanie wkładu

FacetKit docenia wkład, który poprawia jakość badań.

Współtwórcy mogą być wyróżniani poprzez:

- przypisanie autorstwa w raportach eksperymentalnych;
- odnośniki do opublikowanych badań;
- podziękowania dla współtwórców;
- uznanie autorstwa replikacji;
- wymienienie wkładu w dokumentacji badawczej.

Uznanie powinno odzwierciedlać charakter wkładu.

Sama liczba eksperymentów nie powinna decydować o wartości badań.

Niezależna replikacja, staranna ocena i przejrzyste raportowanie wyników negatywnych są ważnymi formami wkładu.

---

## 15. Najczęściej zadawane pytania

### Czy muszę być programistą FacetKit?

Nie.

Możesz uczestniczyć, przeprowadzając eksperymenty, recenzując badania lub dokumentując obserwacje.

### Czy muszę udowodnić, że Facet działa?

Nie.

Celem programu badawczego jest ocena hipotez, a nie ich potwierdzanie za wszelką cenę.

### Czy mogę przesłać wynik negatywny?

Tak.

Wyniki negatywne, mieszane i nierozstrzygające są mile widziane.

### Czy mogę eksperymentować z własnym agentem AI?

Tak.

Należy opisać agenta, model, środowisko i istotne warunki eksperymentu.

### Czy mogę testować kilka Facetów jednocześnie?

Tak, ale eksperyment musi wskazywać badaną kombinację.

Jeżeli to możliwe, zacznij od pojedynczego Facetu, aby ułatwić interpretację wyników.

### Czy zaakceptowany eksperyment oznacza, że hipoteza została udowodniona?

Nie.

Akceptacja oznacza, że raport spełnia wymagania dotyczące zgłoszenia i dokumentacji badań.

Siła dowodów zależy od eksperymentu i późniejszych replikacji.

### Czy mogę powtórzyć istniejący eksperyment?

Tak.

Niezależna replikacja jest jednym z najbardziej wartościowych sposobów wspierania projektu.

---

## 16. Powiązane zasoby

- [FacetKit Research Hub](README.md)
- [Hipotezy FacetKit](../../HYPOTHESES.md)
- [Protokół eksperymentów](EXPERIMENT_PROTOCOL.md)
- [Wyniki badań](RESULTS.md)

---

## 17. Na zakończenie

FacetKit to rozwijany projekt badawczy.

Nie oczekujemy, że każda hipoteza okaże się prawdziwa.

Oczekujemy, że każdy eksperyment pozwoli nam czegoś się dowiedzieć.

Najbardziej wartościowym wkładem nie jest pozytywny wynik.

Jest nim wiarygodny dowód, który pomaga zrozumieć rzeczywiste zachowanie agentów AI.

**Pomóż nam odkryć, co działa, co zawodzi i dlaczego.**
