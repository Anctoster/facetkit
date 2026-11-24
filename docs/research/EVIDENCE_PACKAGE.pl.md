# Pakiet dowodów FacetKit

Pakiet dowodów zachowuje informacje potrzebne innemu uczestnikowi do sprawdzenia, a w miarę możliwości także powtórzenia zgłoszonego eksperymentu.

## Zalecana struktura

```text
evidence/
  <experiment-id>/
    README.md
    protocol.md
    task/
      input.txt
    conditions/
      baseline.yaml
      treatment.yaml
    runs/
      baseline-01/
        prompt.txt
        output.md
        metadata.yaml
      treatment-01/
        prompt.txt
        output.md
        metadata.yaml
    evaluation/
      rubric.md
      scores.csv
      evaluator-notes.md
    artifacts/
      logs/
      screenshots/
    checksums.txt
```

Dostosuj pakiet do skali eksperymentu. Nie twórz pustych katalogów tylko po to, aby odwzorować przykład.

## Wymagane metadane

Dla każdej próby zapisz:
- ID próby, warunek, datę/godzinę i strefę czasową;
- dostawcę, nazwę modelu i dokładną wersję, jeśli jest dostępna;
- instrukcje systemowe/developerskie oraz ID, wersję lub commit Facetu;
- dostępność narzędzi, uprawnienia i istotną konfigurację;
- dokładne wejście zadania i pełną odpowiedź;
- dane o tokenach, koszcie i czasie, jeśli są dostępne;
- oceniającego, wersję rubryki, ocenę i uzasadnienie;
- błędy, ponowienia, pominięcia i odstępstwa.

## Integralność i prywatność

- Zachowuj oryginalne odpowiedzi; adnotacje zapisuj osobno.
- Nie edytuj po cichu promptów ani odpowiedzi po wykonaniu.
- Usuń klucze API, dane uwierzytelniające, prywatne adresy URL, dane osobowe i poufne treści klientów.
- Jeśli usunięcie danych zmienia interpretację, opisz, co zostało usunięte.
- Jeśli to możliwe, preferuj artefakty tekstowe; zrzuty ekranu mogą uzupełniać, ale nie zastępować dowodów możliwych do odczytu maszynowego.
- W miarę możliwości dodaj sumy kontrolne większych artefaktów lub plików przechowywanych zewnętrznie.
- Wskaż każdy artefakt, którego nie można udostępnić, i podaj przyczynę.

## README.md każdego pakietu

Podaj ID eksperymentu, hipotezę, link do raportu, krótki spis zawartości, instrukcję odtworzenia, znane ograniczenia oraz preferencje dotyczące kontaktu i przypisania autorstwa.

Pakiet wspiera raport, ale sam w sobie nie dowodzi poprawności wniosku.
