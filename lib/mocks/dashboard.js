export const mockDashboardData = {
  listaProdotti: [
    { id: 1, nome: "Pasta", categoria: "Dispensa", quantita: 4, scortaMinima: 2, scadenza: "2026-01-15" },
    { id: 2, nome: "Latte", categoria: "Frigo", quantita: 1, scortaMinima: 2, scadenza: "2025-07-13" },
    { id: 3, nome: "Yogurt", categoria: "Frigo", quantita: 3, scortaMinima: 3, scadenza: "2025-07-12" },
    { id: 4, nome: "Piselli surgelati", categoria: "Freezer", quantita: 1, scortaMinima: 1, scadenza: "2027-11-01" }
  ],
  spesaSupermercato: [
    { id: 101, data: "2025-07-09", totale: 42.8, dettaglioArticoli: [] },
    { id: 102, data: "2025-07-02", totale: 35.2, dettaglioArticoli: [] },
    { id: 103, data: "2025-06-25", totale: 51.1, dettaglioArticoli: [] },
    { id: 104, data: "2025-06-18", totale: 38.45, dettaglioArticoli: [] }
  ],
  prodottiInEsaurimento: [
    { idProdotto: 2, nome: "Latte", quantita: 1, scortaMinima: 2 }
  ],
  prodottiInScadenza: [
    { idProdotto: 3, nome: "Yogurt", scadenza: "2025-07-12" },
    { idProdotto: 2, nome: "Latte", scadenza: "2025-07-13" }
  ]
};