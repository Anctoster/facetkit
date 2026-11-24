# Badania społeczności FacetKit — Zacznij tutaj
*Przystępny przewodnik dla uczestników, również dla osób nieprogramujących.*

> **Nie musisz programować, aby pomagać w testowaniu FacetKit.**
> Możesz wykonać przygotowane zadanie w czacie AI, porównać odpowiedzi, ocenić dowody albo niezależnie powtórzyć eksperyment innej osoby.

FacetKit zawiera hipotezy dotyczące zachowania agentów AI. Hipoteza jest twierdzeniem do sprawdzenia — nie faktem ani obietnicą skuteczności. Badania społeczności pomagają ustalić **co się zmienia, w jakich warunkach i jakim kosztem**.

## 1. Wybierz sposób udziału

| Rola | Co robisz | Czy trzeba programować? |
|---|---|---|
| Wykonawca zadania | Wykonujesz przygotowane zadanie bez testowanej reguły i z nią; zapisujesz wyniki | Nie |
| Obserwator | Opisujesz konkretne zachowanie, także błąd lub efekt uboczny | Nie |
| Recenzent dowodów | Sprawdzasz, czy raport zawiera dowody i stosuje własne kryteria | Nie |
| Replikator | Powtarzasz zadanie innego uczestnika w możliwie tych samych warunkach | Nie |
| Projektant zadania | Proponujesz realistyczny scenariusz sprawdzający jedno zachowanie | Nie |
| Współtwórca narzędzi / danych | Ulepszasz skrypty, przykłady lub uporządkowane dane | Czasami |

Starannie wykonane porównanie bez kodowania może być bardziej wartościowe niż duży eksperyment z niejasnymi kryteriami.

## 2. Ścieżka na pięć minut

1. Otwórz [Rejestr hipotez](../../HYPOTHESES.md).
2. Wybierz jedną hipotezę albo skorzystaj z zadania w `TASK_BANK.pl.md`.
3. Otwórz nową rozmowę z AI. Jeśli to możliwe, użyj tego samego modelu i ustawień w obu próbach.
4. Wykonaj zadanie **bez** testowanego Facetu (Baseline).
5. Otwórz drugą, świeżą rozmowę i wykonaj dokładnie to samo zadanie **z** testowanym Facetem (Treatment). Użyj rzeczywistej treści reguły z repozytorium; nie parafrazuj jej, chyba że karta zadania na to pozwala.
6. Oceń obie odpowiedzi według kryteriów ustalonych przed uruchomieniem.
7. Zapisz treść zadania, obie odpowiedzi, oceny, model/datę oraz odstępstwa od planu.
8. Zgłoś raport jako GitHub Issue lub PR zgodnie z zasadami w [Research Hub](README.md). Jeśli nie wiesz jak, rozpocznij dyskusję lub zapytaj w kanale badawczym.

**Ważne:** Szybkie porównanie w czacie jest obserwacją pilotażową. Formalnym wynikiem staje się dopiero po spełnieniu aktualnego Protokołu eksperymentalnego i recenzji. Jedna próba nie jest dowodem.

## 3. Co czyni wkład wartościowym?

Dobry raport odpowiada na pytania:

- Którą hipotezę / Facet ID testowałem?
- Jakie dokładnie zadanie otrzymał agent?
- Co zmieniło się między Baseline i Treatment?
- Co zaobserwowałem według wcześniej ustalonych kryteriów?
- Co się nie udało, zostało pominięte lub odbiegało od planu?
- Czy inna osoba może powtórzyć próbę?

Wynik może mieć status `SUPPORTED`, `NOT_SUPPORTED`, `MIXED`, `INCONCLUSIVE` lub `NOT_REPLICATED`. Wynik negatywny jest mile widziany. Nie usuwaj nieudanej próby ani nie zmieniaj kryteriów po zobaczeniu odpowiedzi.

## 4. Zadbaj o uczciwe porównanie

W prostym porównaniu Baseline–Treatment:

- używaj tego samego tekstu zadania i kontekstu;
- zachowaj ten sam model, wersję, narzędzia i ustawienia, o ile to możliwe;
- zmieniaj tylko testowany Facet;
- używaj świeżej rozmowy dla każdej próby;
- ustal kryteria oceny przed uruchomieniem;
- raportuj wszystkie próby, nie tylko najlepszą.

Jeśli nie możesz zachować któregoś warunku, opisz różnicę. Jeśli model lub narzędzie jest niedostępne, oznacz zadanie jako `BLOCKED` albo `NOT_RUN` — nigdy jako `PASS`.

## 5. Karty zadań

Rozpocznij od karty z [`TASK_BANK.pl.md`](TASK_BANK.pl.md). Karty zawierają zadanie, obserwowane zachowanie i prostą skalę oceny. Bank zadań obejmuje:

- dowody i weryfikację;
- pamięć i przekazywanie pracy;
- dokumentację i kontrolę wersji;
- wymagania i jakość testów;
- weryfikację przeglądarki / interfejsu;
- retrospekcje i decyzje uwzględniające koszt.

Zadania można wykonać bez modyfikowania kodu źródłowego FacetKit. Niektóre hipotezy nadal wymagają, aby programista uruchomił oficjalną próbę FacetKit lub potwierdził konfigurację reguły.

## 6. Zgłoś wkład

### Najprostsza droga: GitHub Issue
Utwórz zgłoszenie w repozytorium i dodaj:
- tytuł: `[Research] <Hypothesis ID> — <krótka nazwa zadania>`;
- ID karty zadania;
- warunki Baseline i Treatment;
- wynik i oceny;
- model / wersję / datę;
- linki lub bezpieczne załączniki z wynikami;
- ograniczenia i odstępstwa.

Użyj PR, jeśli dodajesz lub poprawiasz kartę zadania, zestaw danych albo plik raportu. Nie musisz tworzyć gałęzi, aby zadać pytanie lub zaproponować zadanie.

### Szablon raportu

```text
ID eksperymentu / zadania:
ID hipotezy / Facetu:
Autor (nick GitHub lub anonimowo):
Data:
Model / wersja:
Karta zadania i dokładna treść:
Warunek Baseline:
Warunek Treatment:
Kryteria oceny (ustalone przed próbą):
Wynik Baseline:
Wynik Treatment:
Planowane / wykonane próby:
Błędy, pominięcia lub odstępstwa:
Wynik: SUPPORTED / NOT_SUPPORTED / MIXED / INCONCLUSIVE / NOT_REPLICATED
Co pokazują dowody:
Ograniczenia / możliwe alternatywne wyjaśnienia:
Pliki lub zanonimizowane wyniki:
```

Nie publikuj kluczy API, haseł, prywatnych instrukcji systemowych, danych osobowych, poufnego kodu ani materiałów zastrzeżonych.

## 7. Co jest uwzględniane przy ocenie hipotezy?

Zgłoszenie nie jest automatycznie uwzględniane tylko dlatego, że zostało opublikowane.

Aby raport mógł zostać uwzględniony w rejestrze dowodów hipotezy, recenzenci powinni móc:
1. wskazać dokładną hipotezę i zadanie;
2. odtworzyć warunki w wystarczającym stopniu;
3. zobaczyć surowe lub podsumowane dowody;
4. zrozumieć sposób oceny i wynik;
5. sprawdzić, czy ujawniono błędy i ograniczenia.

Raport wykonawcy może zostać zaakceptowany jako obserwacja, pilotaż lub formalny eksperyment — zależnie od jakości dowodów. Szczególnie cenne są niezależne replikacje. O sposobie aktualizacji rejestru hipotez i wyników badań decydują opiekunowie repozytorium.

## 8. Materiały badawcze

- [Research Hub](README.pl.md)
- [Rejestr hipotez](../../HYPOTHESES.md)
- [Protokół eksperymentalny](EXPERIMENT_PROTOCOL_pl.md)
- [Przewodnik uczestnika](CONTRIBUTOR_GUIDE_pl.md)
- [Wyniki badań](RESULTS_pl.md)

**Celem nie jest udowodnienie, że FacetKit ma rację. Celem jest odkrycie, co naprawdę działa niezawodnie.**
