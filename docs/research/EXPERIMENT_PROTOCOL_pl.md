# Protokół eksperymentów FacetKit

**Wersja:** 0.1  
**Status:** Wersja robocza  
**Cel:** Ocena hipotez dotyczących zachowania agentów AI

---

## 1. Cel

FacetKit zawiera zbiór hipotez dotyczących zachowania agentów AI, których celem jest poprawa ich niezawodności, skuteczności i weryfikowalności.

Hipoteza nie jest faktem.

Celem niniejszego protokołu jest ustanowienie spójnej metody oceny, czy określony Facet:

- wywołuje oczekiwaną zmianę zachowania;
- poprawia wyniki wykonywanych zadań;
- ogranicza liczbę błędów lub niepożądanych zachowań;
- powoduje dodatkowe koszty lub skutki uboczne;
- działa w sposób powtarzalny w różnych warunkach.

Protokół określa minimalne wymagania dotyczące projektowania, przeprowadzania, dokumentowania i recenzowania eksperymentów FacetKit.

Celem nie jest udowodnienie, że FacetKit działa w każdej sytuacji.

Celem jest ustalenie **co działa, w jakich warunkach i z jakim mierzalnym skutkiem**.

---

## 2. Zasady badawcze

Wszystkie eksperymenty FacetKit powinny przestrzegać poniższych zasad.

### 2.1. Hipotezy nie są faktami

Hipoteza jest twierdzeniem dotyczącym zachowania, które można poddać weryfikacji.

Musi pozostać otwarta na potwierdzenie, odrzucenie lub zmianę.

### 2.2. Wyniki należy raportować rzetelnie

Wyniki pozytywne, negatywne, mieszane i nierozstrzygające są równie wartościowymi rezultatami badań.

Eksperymentów nie wolno pomijać wyłącznie dlatego, że nie potwierdziły hipotezy.

### 2.3. Kryteria należy określić przed eksperymentem

Oczekiwany rezultat i kryteria oceny muszą zostać ustalone przed rozpoczęciem eksperymentu.

Nie wolno zmieniać kryteriów po fakcie w celu przedstawienia wyniku jako sukcesu.

Jeżeli projekt eksperymentu ulegnie zmianie, należy ją udokumentować.

### 2.4. Powtarzalność ma znaczenie

Inny badacz powinien móc zrozumieć eksperyment i odtworzyć go w możliwie zbliżonych warunkach.

### 2.5. Wnioski muszą odpowiadać sile dowodów

Siła wniosku nie może przekraczać siły dostępnych dowodów.

Pomyślne wykonanie jednego zadania nie dowodzi, że dany Facet jest skuteczny w każdych warunkach.

### 2.6. Należy uwzględniać koszty i skutki uboczne

Facet, który poprawia jeden wskaźnik, może pogarszać inny.

Ocena powinna uwzględniać istotne kompromisy, w tym:

- jakość wykonania zadania;
- niezawodność;
- czas wykonania;
- zużycie tokenów;
- koszt finansowy;
- niepotrzebne ograniczenia;
- niezamierzone zachowania.

---

## 3. Cykl eksperymentu

Standardowy eksperyment FacetKit przebiega według następującego schematu:

```text
Wybór hipotezy
      ↓
Pytanie badawcze
      ↓
Projekt eksperymentu
      ↓
Wstępne określenie kryteriów
      ↓
Próby bazowe (baseline)
      ↓
Próby z Facetem (treatment)
      ↓
Ocena
      ↓
Klasyfikacja wyniku
      ↓
Złożenie raportu
      ↓
Recenzja
      ↓
Replikacja lub dalsze badania
```

Każdy etap powinien być udokumentowany.

Eksperyment można przerwać, jeżeli jego kontynuowanie stanie się niebezpieczne, nieważne metodologicznie lub niemożliwe do przeprowadzenia zgodnie z planem.

Przyczynę przerwania należy odnotować.

---

## 4. Wybór hipotezy

Badacze powinni wybierać hipotezy z pliku:

[`HYPOTHESES.md`](../../HYPOTHESES.md)

Odpowiednia hipoteza powinna opisywać twierdzenie dotyczące zachowania, które można ocenić na podstawie obserwowalnych wyników.

Przed wyborem hipotezy należy ustalić:

1. Jakie zachowanie ma ulec zmianie?
2. W jakich warunkach powinna wystąpić ta zmiana?
3. Jakie obserwowalne dowody wskazywałyby na zmianę?
4. Jaki wynik byłby sprzeczny z hipotezą?
5. Czy oczekiwany efekt można wiarygodnie zmierzyć?

### 4.1. Pytanie badawcze

Każdy eksperyment musi zawierać jasne pytanie badawcze.

Przykład:

> Czy zastosowanie Facetu P03 zmniejsza liczbę błędnych założeń przyjmowanych przez agenta AI podczas implementacji niejednoznacznych wymagań programistycznych?

Pytanie badawcze powinno dotyczyć wyniku, a nie jedynie obecności reguły.

Słabe pytanie:

> Czy agent przestrzega P03?

Lepsze pytanie:

> Czy zastosowanie P03 zmniejsza liczbę błędnych założeń bez istotnego wydłużenia czasu realizacji zadania?

---

## 5. Projektowanie eksperymentu

Przed rozpoczęciem badania należy zdefiniować jego projekt.

### 5.1. Wymagane informacje

Każdy eksperyment powinien określać:

| Pole | Opis |
|---|---|
| Experiment ID | Unikalny identyfikator |
| Hypothesis ID | Identyfikator badanego Facetu lub hipotezy |
| Research question | Pytanie badawcze |
| Expected effect | Oczekiwana zmiana zachowania |
| Task or scenario | Zadanie lub scenariusz |
| Baseline condition | Warunek bez badanego Facetu |
| Treatment condition | Warunek z zastosowanym Facetem |
| Evaluation criteria | Kryteria oceny wyniku |
| Execution plan | Plan i liczba prób |
| Limitations | Znane ograniczenia lub ryzyka |

### 5.2. Izolacja badanego Facetu

Jeżeli to możliwe, należy oceniać jeden Facet naraz.

Jeżeli jednocześnie zostanie zastosowanych kilka Facetów, może być trudno ustalić, który z nich spowodował zaobserwowany efekt.

Eksperymenty obejmujące zestawy Facetów są dopuszczalne, ale muszą jasno wskazywać badaną kombinację.

### 5.3. Oczekiwane i nieoczekiwane wyniki

Przed rozpoczęciem eksperymentu należy opisać:

- oczekiwany pozytywny rezultat;
- oczekiwany negatywny rezultat;
- możliwe niezamierzone skutki;
- warunki, w których hipoteza może nie mieć zastosowania.

Ogranicza to ryzyko interpretowania każdego wyniku jako potwierdzenia hipotezy.

---

## 6. Warunki bazowe i eksperymentalne

Wiarygodny eksperyment dotyczący zachowania wymaga porównania.

### 6.1. Baseline — warunek bazowy

Baseline opisuje zachowanie agenta bez badanego Facetu.

Agent otrzymuje zadanie w standardowych warunkach projektu.

### 6.2. Treatment — warunek eksperymentalny

Treatment opisuje zachowanie agenta po zastosowaniu badanego Facetu.

W miarę możliwości warunek eksperymentalny powinien różnić się od bazowego wyłącznie badaną zmienną.

### 6.3. Porównanie

Przykład:

```text
Baseline:
Agent otrzymuje zadanie bez badanego Facetu.

Treatment:
Agent otrzymuje to samo zadanie z zastosowanym Facetem.

Ocena:
Porównanie liczby błędnych założeń,
skuteczności zadania, zakresu poprawek
i kosztu wykonania.
```

### 6.4. Warunki kontrolne

Badacze powinni utrzymywać spójność istotnych warunków:

- model i jego wersja;
- instrukcje systemowe;
- opis zadania;
- dostępne narzędzia;
- kontekst projektu;
- kryteria oceny;
- środowisko wykonawcze.

Jeżeli nie można zachować spójności danego warunku, należy opisać różnicę.

### 6.5. Niedeterministyczne zachowanie modeli

Zachowanie agentów AI może różnić się między kolejnymi wykonaniami.

Pojedyncza udana lub nieudana próba zazwyczaj nie wystarcza do ustalenia wiarygodnego efektu behawioralnego.

Jeżeli to możliwe:

- powtarzaj eksperyment;
- używaj kilku porównywalnych zadań;
- porównuj baseline i treatment w zbliżonych warunkach;
- raportuj zmienność wyników;
- nie wybieraj wyłącznie najbardziej korzystnych prób.

W eksperymentach wielokrotnych należy podać planowaną i faktycznie zrealizowaną liczbę prób.

---

## 7. Kryteria oceny

Kryteria oceny muszą być związane z pytaniem badawczym.

Nie każdy eksperyment wymaga zastosowania wszystkich wskaźników.

### 7.1. Wskaźniki behawioralne

Przykłady:

| Wskaźnik | Opis |
|---|---|
| Requirement Compliance | Stopień spełnienia określonych wymagań |
| Error Rate | Częstotliwość występowania istotnych błędów |
| Task Success | Czy osiągnięto zamierzony rezultat zadania |
| Assumption Accuracy | Poprawność przyjętych założeń |
| Rework | Zakres wymaganych poprawek |
| Verification Quality | Jakość weryfikacji deklarowanych wyników |

### 7.2. Wskaźniki operacyjne

Przykłady:

| Wskaźnik | Opis |
|---|---|
| Execution Time | Czas potrzebny na wykonanie zadania |
| Token Usage | Liczba zużytych tokenów |
| Financial Cost | Szacowany lub rzeczywisty koszt wykonania |
| Tool Calls | Liczba wywołań narzędzi |
| Failure Rate | Częstotliwość niepowodzeń wykonania |

### 7.3. Skutki uboczne

Badacze powinni odnotowywać istotne niezamierzone skutki, np.:

- nadmierne zadawanie pytań doprecyzowujących;
- nieuzasadnione odmowy;
- zbyt restrykcyjne zachowanie;
- dodatkową złożoność;
- wzrost kosztów;
- spadek skuteczności realizacji zadań;
- nadmierną dokumentację;
- opóźnienia w wykonaniu.

### 7.4. Metoda oceny

Należy opisać zastosowaną metodę oceny.

Możliwe metody:

- testy deterministyczne;
- ocena człowieka;
- ocena według zdefiniowanej rubryki;
- niezależny ewaluator;
- automatyczne punktowanie;
- porównanie z wynikiem referencyjnym.

Jeżeli jako ewaluatora wykorzystuje się model AI, należy — o ile to możliwe — zapisać model i instrukcje oceny.

Automatyczna ocena nie jest automatycznie obiektywna.

---

## 8. Przeprowadzanie prób

Przed uruchomieniem eksperymentu należy sprawdzić, czy:

- projekt eksperymentu jest kompletny;
- hipoteza została jednoznacznie wskazana;
- warunki baseline i treatment są zdefiniowane;
- kryteria oceny zostały udokumentowane;
- środowisko wykonawcze zostało opisane;
- zastosowano wymagane środki bezpieczeństwa.

Podczas eksperymentu należy zapisywać:

- identyfikator próby;
- warunek eksperymentalny;
- dane wejściowe zadania;
- istotne wyniki działania agenta;
- rezultat oceny;
- błędy wykonania;
- odstępstwa od planu.

Nie należy po cichu usuwać nieudanych prób.

Jeżeli próba jest nieważna i zostaje wykluczona z analizy, należy wyjaśnić przyczynę.

W miarę możliwości pierwotny wynik powinien pozostać dostępny do wglądu.

---

## 9. Klasyfikacja wyników

Każdy zakończony eksperyment powinien otrzymać jedną główną klasyfikację.

### 9.1. Supported — potwierdzona zgodność z hipotezą

Zaobserwowane wyniki są zgodne z hipotezą i spełniają wcześniej określone kryteria oceny.

Nie oznacza to, że hipoteza została udowodniona w sposób uniwersalny.

### 9.2. Not Supported — brak potwierdzenia

Eksperyment nie wykazał oczekiwanego efektu lub wyniki są sprzeczne z hipotezą.

### 9.3. Mixed — wyniki mieszane

Wyniki wspierają hipotezę w niektórych warunkach, ale nie w innych.

### 9.4. Inconclusive — wynik nierozstrzygający

Eksperyment nie dostarczył wystarczających dowodów do sformułowania wiarygodnego wniosku.

Możliwe przyczyny:

- zbyt mała liczba obserwacji;
- niewiarygodna metoda oceny;
- zbyt duża zmienność;
- nieprawidłowe warunki eksperymentalne;
- niekompletne wykonanie.

### 9.5. Not Replicated — brak replikacji

Wcześniej opublikowanego wyniku nie udało się odtworzyć w warunkach replikacji.

Pierwotnego wyniku nie należy usuwać ani nadpisywać.

### 9.6. Status a poziom dowodów

Klasyfikacja wyniku i poziom dojrzałości dowodów to dwie odrębne kwestie.

Wynik może mieć status `SUPPORTED`, pozostając na wczesnym poziomie dowodowym.

Przykład:

```text
Result: SUPPORTED
Evidence Level: E2
```

Oznacza to, że eksperyment wspiera hipotezę, ale dowody nie zostały jeszcze potwierdzone przez niezależną replikację ani szerszą walidację.

---

## 10. Poziomy dojrzałości dowodów

FacetKit może stosować następującą skalę do komunikowania stopnia dojrzałości dowodów dotyczących hipotez behawioralnych.

| Poziom | Nazwa | Opis |
|---|---|---|
| E0 | Proposed | Hipoteza została sformułowana, ale nie była testowana |
| E1 | Observed | Zaobserwowano istotne zachowanie, ale brak kontrolowanego porównania |
| E2 | Tested | Udokumentowany eksperyment ocenił hipotezę |
| E3 | Replicated | Wynik został niezależnie odtworzony |
| E4 | Cross-Project | Wynik oceniono w wielu projektach lub środowiskach |

Poziomy te stanowią konwencję badawczą FacetKit.

Nie zastępują analizy statystycznej ani uniwersalnego standardu naukowego.

Poziom dowodów należy przypisywać zachowawczo.

Wyższy poziom dowodów nie oznacza automatycznie większego efektu ani wyższej wartości praktycznej.

---

## 11. Raportowanie wyników

Każdy zakończony eksperyment musi mieć raport.

Raport powinien zawierać:

### 11.1. Metadane eksperymentu

- identyfikator eksperymentu;
- identyfikator hipotezy;
- badacza lub współtwórcę;
- datę;
- wersję lub commit FacetKit;
- model i jego wersję;
- środowisko.

### 11.2. Projekt eksperymentu

- pytanie badawcze;
- oczekiwany efekt;
- baseline;
- treatment;
- zadanie lub scenariusz;
- kryteria oceny;
- planowaną liczbę prób.

### 11.3. Dane z wykonania

- zakończone próby;
- próby nieudane lub wykluczone;
- surowe lub podsumowane obserwacje;
- odstępstwa od planu.

### 11.4. Wyniki

- zaobserwowane rezultaty;
- wartości wskaźników;
- porównanie baseline i treatment;
- klasyfikację wyniku;
- poziom dowodów.

### 11.5. Interpretacja

Badacz powinien wyjaśnić:

- co wskazują wyniki;
- czy hipoteza została wsparta;
- jakie alternatywne wyjaśnienia pozostają możliwe;
- jakie ograniczenia dotyczą eksperymentu;
- co warto zbadać w następnej kolejności.

Raport musi odróżniać zaobserwowane dane od ich interpretacji.

---

## 12. Powtarzalność

Eksperyment powinien zawierać wystarczające informacje, aby inny badacz mógł go odtworzyć.

W miarę możliwości należy udostępnić:

- dane wejściowe zadań;
- istotne prompty lub instrukcje;
- konfigurację Facetów;
- informacje o modelu;
- rubrykę oceny;
- parametry wykonania;
- dane wynikowe;
- instrukcję odtworzenia eksperymentu.

Nie wolno publikować poufnych informacji projektowych, danych uwierzytelniających, prywatnych danych użytkowników ani wrażliwych instrukcji systemowych.

Jeżeli pewnych informacji nie można udostępnić, należy opisać to ograniczenie.

---

## 13. Recenzja badań

Zgłoszone eksperymenty mogą być oceniane pod kątem:

- jasności pytania badawczego;
- spójności projektu eksperymentu;
- adekwatności warunków bazowych i eksperymentalnych;
- trafności kryteriów oceny;
- kompletności raportu;
- powtarzalności;
- właściwej interpretacji;
- przejrzystości ograniczeń.

Recenzenci nie powinni wymagać pozytywnego wyniku.

Raport z negatywnym wynikiem może zostać zaakceptowany, jeżeli eksperyment został przeprowadzony i opisany zgodnie z wymaganiami.

Akceptacja raportu oznacza, że spełnia on wymagania dokumentacyjne.

Nie oznacza automatycznie potwierdzenia hipotezy.

---

## 14. Bezpieczeństwo i kwestie etyczne

Eksperymenty nie mogą naruszać:

- prywatności użytkowników;
- poufności informacji;
- bezpieczeństwa systemów;
- danych produkcyjnych;
- kontroli dostępu;
- bezpieczeństwa operacji o krytycznym znaczeniu.

Eksperymenty obejmujące działania destrukcyjne, systemy zewnętrzne lub dane wrażliwe muszą wykorzystywać odpowiednie zabezpieczenia.

FacetKit nie powinien być traktowany jako środowisko izolacji bezpieczeństwa (sandbox).

Wymagane uprawnienia i izolację muszą zapewniać platforma, narzędzia oraz środowisko wykonawcze.

Badacze powinni przerwać eksperyment, jeżeli jego kontynuowanie stworzy niedopuszczalne ryzyko.

---

## 15. Ograniczenia

Każdy eksperyment ma swoje ograniczenia.

Badacze powinni wskazywać istotne ograniczenia, w tym:

- zależność od modelu;
- zależność od rodzaju zadania;
- małą próbę badawczą;
- zmienność wynikającą z niedeterministycznego działania modelu;
- stronniczość ewaluatora;
- różnice środowiskowe;
- ograniczoną możliwość replikacji;
- niepełną obserwowalność.

Wnioski muszą mieścić się w zakresie przeprowadzonego eksperymentu.

Przykład:

> P03 ograniczył liczbę błędnych założeń w testowanych scenariuszach.

To stwierdzenie jest właściwsze niż:

> P03 zwiększa niezawodność agentów AI.

Drugie stwierdzenie wymaga znacznie szerszego zakresu dowodów.

---

## 16. Rzetelność badań

Badania FacetKit powinny przedkładać rzetelność nad promocję projektu.

Badacze nie mogą:

- fabrykować ani modyfikować wyników;
- pomijać istotnych niepowodzeń;
- wybiórczo publikować korzystnych prób;
- zmieniać kryteriów oceny po wykonaniu eksperymentu bez ujawnienia tej zmiany;
- deklarować niezależnej replikacji, jeżeli jej nie przeprowadzono;
- przedstawiać raportu obserwacyjnego jako kontrolowanego eksperymentu;
- wyciągać wniosków wykraczających poza dostępne dowody.

Korekty i aktualizacje powinny być dokumentowane.

Jeżeli okaże się, że opublikowany wynik jest nieprawidłowy, raport należy skorygować, zachowując historię zmian.

---

## 17. Lista kontrolna

Przed przesłaniem eksperymentu sprawdź:

- [ ] Hipoteza została jednoznacznie wskazana.
- [ ] Pytanie badawcze jest konkretne.
- [ ] Oczekiwany efekt został zdefiniowany.
- [ ] Warunki baseline i treatment zostały udokumentowane.
- [ ] Kryteria oceny ustalono przed wykonaniem eksperymentu.
- [ ] Zapisano istotne warunki wykonania.
- [ ] Udokumentowano nieudane i wykluczone próby.
- [ ] Wyniki przedstawiono rzetelnie.
- [ ] Wskazano ograniczenia.
- [ ] Wnioski nie wykraczają poza dostępne dowody.
- [ ] Raport można zrecenzować i odtworzyć.

---

## 18. Powiązane zasoby

- [Hipotezy FacetKit](../../HYPOTHESES.md)
- [Research Hub](README.md)
- [Przewodnik dla współtwórców](CONTRIBUTOR_GUIDE.md)
- [Wyniki badań](RESULTS.md)

---

**Zasada badawcza FacetKit**

> Hipoteza behawioralna nabiera wartości nie wtedy, gdy zostaje zapisana, lecz wtedy, gdy jej efekt można zaobserwować, ocenić, zakwestionować i odtworzyć.
