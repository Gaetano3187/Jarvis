}

ESEMPIO 3 (non da ripetere)
Input: "Ieri ho acquistato 2 biglietti del cinema a 18 euro in totale al Cinema Lux"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Cinema Lux",
      "dettaglio": "2 biglietti del cinema",
      "prezzoTotale": 18.00,
      "quantita": 2,
      "data": "<IERI>",
      "categoria": "tempo libero",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 4 (non da ripetere)
Input: "Ho speso 45,99€ su Amazon per un paio di cuffie il 15 giugno 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Amazon",
      "dettaglio": "1 paio di cuffie",
      "prezzoTotale": 45.99,
      "quantita": 1,
      "data": "2025-06-15",
      "categoria": "tecnologia",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 5 (non da ripetere)
Input: "Al benzinaio Shell ho fatto il pieno: 50 litri di benzina a 1,80 al litro"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Shell",
      "dettaglio": "50 litri di benzina",
      "prezzoTotale": 90.00,
      "quantita": 50,
      "data": "<ODIERNA>",
      "categoria": "trasporti",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 6 (non da ripetere)
Input: "Ho ordinato da Just Eat 3 pizze margherita per 24 euro totali"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Just Eat",
      "dettaglio": "3 pizze margherita",
      "prezzoTotale": 24.00,
      "quantita": 3,
      "data": "<ODIERNA>",
      "categoria": "casa",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 7 (non da ripetere)
Input: "Pagato abbonamento palestra mensile di 60€ oggi"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Palestra (abbonamento)",
      "dettaglio": "Abbonamento mensile palestra",
      "prezzoTotale": 60.00,
      "quantita": 1,
      "data": "<ODIERNA>",
      "categoria": "salute",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

ESEMPIO 8 (non da ripetere)
Input: "Ho comprato un biglietto del treno Frecciarossa Roma-Milano per 79,50€ il 2 agosto 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Frecciarossa",
      "dettaglio": "Biglietto treno Roma-Milano",
      "prezzoTotale": 79.50,
      "quantita": 1,
      "data": "2025-08-02",
      "categoria": "trasporti",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

ESEMPIO 9 (non da ripetere)
Input: "Ho speso 12 euro al bar Caffè Italia per due cappuccini e due cornetti questa mattina"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Caffè Italia",
      "dettaglio": "2 cappuccini e 2 cornetti",
      "prezzoTotale": 12.00,
      "quantita": 4,
      "data": "<ODIERNA>",
      "categoria": "casa",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 10 – Vestiti (non da ripetere)
Input: "Ieri ho comprato da Zara 2 magliette a 12,99€ ciascuna"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Zara",
      "dettaglio": "2 magliette",
      "prezzoTotale": 25.98,
      "quantita": 2,
      "data": "<IERI>",
      "categoria": "vestiti",
      "category_id": "\${CATEGORY_ID_VESTITI}"
    }
  ]
}

ESEMPIO 11 – Vestiti (non da ripetere)
Input: "Ho preso un paio di jeans Levi's su Amazon a 59,90 euro il 18 aprile 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Amazon",
      "dettaglio": "1 paio di jeans Levi's",
      "prezzoTotale": 59.90,
      "quantita": 1,
      "data": "2025-04-18",
      "categoria": "vestiti",
      "category_id": "\${CATEGORY_ID_VESTITI}"
    }
  ]
}

ESEMPIO 12 – Cene (non da ripetere)
Input: "Stasera cena al Ristorante Da Gino: conto totale 80 euro per 2 persone"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Ristorante Da Gino",
      "dettaglio": "2 coperti (cena)",
      "prezzoTotale": 80.00,
      "quantita": 2,
      "data": "<ODIERNA>",
      "categoria": "cene",
      "category_id": "\${CATEGORY_ID_CENE}"
    }
  ]
}

ESEMPIO 13 – Cene (non da ripetere)
Input: "Ho speso 35,50€ per una cena da Sushi House ieri sera"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Sushi House",
      "dettaglio": "1 cena",
      "prezzoTotale": 35.50,
      "quantita": 1,
      "data": "<IERI>",
      "categoria": "cene",
      "category_id": "\${CATEGORY_ID_CENE}"
    }
  ]
}

ESEMPIO 14 – Varie (non da ripetere)
Input: "Ricarica telefonica Vodafone 20 euro oggi"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Vodafone",
      "dettaglio": "Ricarica telefonica",
      "prezzoTotale": 20.00,
      "quantita": 1,
      "data": "<ODIERNA>",
      "categoria": "varie",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

ESEMPIO 15 – Varie (non da ripetere)
Input: "Pagato parcheggio 4 ore al Parcheggio Centrale: 8 euro il 25 luglio 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Parcheggio Centrale",
      "dettaglio": "4 ore di parcheggio",
      "prezzoTotale": 8.00,
      "quantita": 4,
      "data": "2025-07-25",
      "categoria": "varie",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

Ora capisci la frase seguente (proveniente da **\${source}**) e compila i campi:
"\${userText}"
`
  }
