// Written by demo.test.ts from fixture games through the real story builder (UPDATE_DEMO=1 pnpm test apps/web).
// An invented player; do not edit by hand.
export const DEMO_DATA: { reports: unknown[]; weeks: unknown[] } = {
 "reports": [
  {
   "player": "tidy_rookling",
   "track": {
    "platform": "lichess",
    "username": "tidy_rookling",
    "timeClass": "rapid"
   },
   "kind": "first",
   "revision": 1,
   "periodStart": "2026-11-02T00:00:00.000Z",
   "periodEnd": "2026-11-30T00:00:00.000Z",
   "rating": 1240,
   "band": "club",
   "bandSource": "ratings",
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "gamesFound": 18,
   "gamesAnalyzed": 18,
   "gameIds": [
    "lichess:fxpart01",
    "lichess:fxend001",
    "lichess:fxfoll01",
    "lichess:fxothr01"
   ],
   "coverage": {
    "sampled": 18,
    "analysed": 18,
    "total": 18,
    "complete": true,
    "sampleOnly": false,
    "checked": 18
   },
   "current": {
    "start": "2026-11-30T00:00:00.000Z",
    "end": "2026-12-07T00:00:00.000Z",
    "games": 18,
    "moves": 630,
    "mistakesPer100Moves": 9.8,
    "settings": {
     "analysisVersion": 2,
     "patternsVersion": 1,
     "engine": {
      "name": "Stub 1",
      "depth": 12
     },
     "checkDepth": 18
    },
    "stats": [
     {
      "patternId": "missed-mate",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "allowed-mate",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "hung-piece",
      "games": 18,
      "moves": 630,
      "gamesAffected": 4,
      "occurrences": 5,
      "per100Moves": 0.79,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "allowed-tactic",
      "games": 18,
      "moves": 630,
      "gamesAffected": 5,
      "occurrences": 6,
      "per100Moves": 0.95,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "missed-capture",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "missed-tactic",
      "games": 18,
      "moves": 630,
      "gamesAffected": 3,
      "occurrences": 4,
      "per100Moves": 0.63,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "thrown-win",
      "games": 18,
      "moves": 630,
      "gamesAffected": 2,
      "occurrences": 3,
      "per100Moves": 0.48,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "time-trouble",
      "games": 18,
      "moves": 630,
      "gamesAffected": 1,
      "occurrences": 2,
      "per100Moves": 0.32,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "opening-trouble",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     }
    ]
   },
   "comparison": null,
   "weeks": [
    {
     "start": "2026-11-30T00:00:00.000Z",
     "end": "2026-12-07T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-23T00:00:00.000Z",
     "end": "2026-11-30T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-16T00:00:00.000Z",
     "end": "2026-11-23T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-09T00:00:00.000Z",
     "end": "2026-11-16T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-02T00:00:00.000Z",
     "end": "2026-11-09T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-10-26T00:00:00.000Z",
     "end": "2026-11-02T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    }
   ],
   "trends": [],
   "priorities": [],
   "focus": [
    {
     "patternId": "allowed-tactic",
     "title": "Moves that let a fork in",
     "why": "In {gamesAffected} of your {games} games a move of yours handed the other side something for free.",
     "drill": "Before each move, look for the opponent's checks, captures and double attacks.",
     "exampleGameIds": [
      "lichess:fxpart01",
      "lichess:fxend001"
     ],
     "baseline": {
      "patternId": "allowed-tactic",
      "games": 64,
      "moves": 2240,
      "gamesAffected": 22,
      "occurrences": 23,
      "per100Moves": 1.03,
      "avgWinPctLoss": 30
     },
     "target": 0.96,
     "since": "2026-11-16T00:00:00.000Z",
     "reason": {
      "kind": "kept",
      "previousRank": 1,
      "score": 10,
      "recentCost": 5,
      "naiveCostThisPeriod": 5,
      "rate": 1,
      "severity": 30,
      "chronicity": 0.8,
      "weeksRecurred": 6,
      "weeksCounted": 6,
      "weeks": [
       true,
       true,
       true,
       true,
       true,
       true
      ]
     },
     "examples": [
      {
       "patternId": "allowed-tactic",
       "gameId": "lichess:fxpart01",
       "ply": 1,
       "winPctLoss": 68.53127023839994,
       "motif": "fork",
       "fen": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1",
       "played": "Qd2",
       "best": "Re1",
       "story": {
        "played": {
         "san": "Qd2",
         "uci": "d1d2",
         "from": "d1",
         "to": "d2",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne4+",
          "uci": "f6e4",
          "from": "f6",
          "to": "e4",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
         },
         {
          "san": "Ke1",
          "uci": "f2e1",
          "from": "f2",
          "to": "e1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ2PP/R3K2R b - - 3 2"
         },
         {
          "san": "Nxd2",
          "uci": "e4d2",
          "from": "e4",
          "to": "d2",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPn2PP/R3K2R w - - 0 3"
         },
         {
          "san": "Kxd2",
          "uci": "e1d2",
          "from": "e1",
          "to": "d2",
          "piece": "king",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPK2PP/R6R b - - 0 3"
         }
        ],
        "replyFound": true,
        "actualReply": {
         "san": "Ne4+",
         "uci": "f6e4",
         "from": "f6",
         "to": "e4",
         "piece": "knight",
         "color": "black",
         "check": true,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
        },
        "followed": 2,
        "better": [
         {
          "san": "Re1",
          "uci": "h1e1",
          "from": "h1",
          "to": "e1",
          "piece": "rook",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2QR3 b - - 1 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "f2",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "d2",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "d2",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [
          {
           "san": "Ne4+",
           "uci": "f6e4",
           "from": "f6",
           "to": "e4",
           "piece": "knight",
           "color": "black",
           "check": true,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
          }
         ],
         "ended": false,
         "paid": false
        },
        "gain": -6,
        "betterGain": 0,
        "betterReason": {
         "kind": "covers-square",
         "square": "e4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.60714585480221,
        "winPctAfter": 26.07587561640227,
        "depth": 1
       },
       "traits": [
        "answer-check",
        "answer-fork"
       ]
      },
      {
       "patternId": "allowed-tactic",
       "gameId": "lichess:fxend001",
       "ply": 1,
       "winPctLoss": 68.53127023839994,
       "motif": "fork",
       "fen": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1",
       "played": "Qd2",
       "best": "Re1",
       "story": {
        "played": {
         "san": "Qd2",
         "uci": "d1d2",
         "from": "d1",
         "to": "d2",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne4+",
          "uci": "f6e4",
          "from": "f6",
          "to": "e4",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
         },
         {
          "san": "Ke1",
          "uci": "f2e1",
          "from": "f2",
          "to": "e1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ2PP/R3K2R b - - 3 2"
         },
         {
          "san": "Nxd2",
          "uci": "e4d2",
          "from": "e4",
          "to": "d2",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPn2PP/R3K2R w - - 0 3"
         },
         {
          "san": "Kxd2",
          "uci": "e1d2",
          "from": "e1",
          "to": "d2",
          "piece": "king",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPK2PP/R6R b - - 0 3"
         }
        ],
        "replyFound": false,
        "followed": 0,
        "better": [
         {
          "san": "Re1",
          "uci": "h1e1",
          "from": "h1",
          "to": "e1",
          "piece": "rook",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2QR3 b - - 1 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "f2",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "d2",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "d2",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [],
         "ended": true,
         "paid": false
        },
        "gain": -6,
        "betterGain": 0,
        "betterReason": {
         "kind": "covers-square",
         "square": "e4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.60714585480221,
        "winPctAfter": 26.07587561640227,
        "depth": 1
       },
       "traits": [
        "answer-check",
        "moved-piece-lost"
       ]
      }
     ],
     "blindSpots": [
      {
       "id": "answer-check",
       "basis": "line",
       "count": 11,
       "games": 10,
       "of": 27,
       "baselineCount": 29,
       "baselineOf": 230,
       "refinement": {
        "id": "answer-knight-check",
        "count": 6
       },
       "examples": []
      },
      {
       "id": "moved-piece-lost",
       "basis": "line",
       "count": 10,
       "games": 9,
       "of": 27,
       "baselineCount": 52,
       "baselineOf": 230,
       "examples": []
      }
     ],
     "blindSpotWindow": {
      "start": "2026-10-26T00:00:00.000Z",
      "end": "2026-12-07T00:00:00.000Z",
      "games": 96,
      "mistakes": 230
     },
     "steps": [
      {
       "blindSpot": "answer-check",
       "text": "Before you let go of the piece, find every check they would have, knight checks first."
      },
      {
       "blindSpot": "moved-piece-lost",
       "text": "Look at the square you are moving to. Count what attacks the piece there and what guards it."
      }
     ],
     "goal": {
      "per": 1,
      "of": 4
     }
    },
    {
     "patternId": "hung-piece",
     "title": "Pieces left to be taken",
     "why": "In {gamesAffected} of your {games} games a move of yours handed the other side something for free.",
     "drill": "Before each move, look for the opponent's checks, captures and double attacks.",
     "exampleGameIds": [
      "lichess:fxfoll01",
      "lichess:fxothr01"
     ],
     "baseline": {
      "patternId": "hung-piece",
      "games": 64,
      "moves": 2240,
      "gamesAffected": 16,
      "occurrences": 17,
      "per100Moves": 0.76,
      "avgWinPctLoss": 30
     },
     "target": 0.96,
     "since": "2026-11-16T00:00:00.000Z",
     "reason": {
      "kind": "new",
      "previousRank": null,
      "score": 10,
      "recentCost": 5,
      "naiveCostThisPeriod": 5,
      "rate": 1,
      "severity": 30,
      "chronicity": 0.8,
      "weeksRecurred": 4,
      "weeksCounted": 5,
      "weeks": [
       true,
       true,
       false,
       true,
       true,
       null
      ]
     },
     "examples": [
      {
       "patternId": "hung-piece",
       "gameId": "lichess:fxfoll01",
       "ply": 1,
       "winPctLoss": 88.41393778908468,
       "fen": "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1",
       "played": "Qc1",
       "best": "Qxd4",
       "story": {
        "played": {
         "san": "Qc1",
         "uci": "d2c1",
         "from": "d2",
         "to": "c1",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne2+",
          "uci": "d4e2",
          "from": "d4",
          "to": "e2",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
         },
         {
          "san": "Kh1",
          "uci": "g1h1",
          "from": "g1",
          "to": "h1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2R1K b - - 3 2"
         },
         {
          "san": "Nxc1",
          "uci": "e2c1",
          "from": "e2",
          "to": "c1",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2n2R1K w - - 0 3"
         },
         {
          "san": "Rxc1",
          "uci": "f1c1",
          "from": "f1",
          "to": "c1",
          "piece": "rook",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2R4K b - - 0 3"
         }
        ],
        "replyFound": true,
        "actualReply": {
         "san": "Ne2+",
         "uci": "d4e2",
         "from": "d4",
         "to": "e2",
         "piece": "knight",
         "color": "black",
         "check": true,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
        },
        "followed": 4,
        "better": [
         {
          "san": "Qxd4",
          "uci": "d2d4",
          "from": "d2",
          "to": "d4",
          "piece": "queen",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/3Q4/8/PPP2PPP/5RK1 b - - 0 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "g1",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "c1",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "c1",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [
          {
           "san": "Ne2+",
           "uci": "d4e2",
           "from": "d4",
           "to": "e2",
           "piece": "knight",
           "color": "black",
           "check": true,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
          },
          {
           "san": "Kh1",
           "uci": "g1h1",
           "from": "g1",
           "to": "h1",
           "piece": "king",
           "color": "white",
           "check": false,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2R1K b - - 3 2"
          },
          {
           "san": "Nxc1",
           "uci": "e2c1",
           "from": "e2",
           "to": "c1",
           "piece": "knight",
           "color": "black",
           "captured": "queen",
           "check": false,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2n2R1K w - - 0 3"
          },
          {
           "san": "Rxc1",
           "uci": "f1c1",
           "from": "f1",
           "to": "c1",
           "piece": "rook",
           "color": "white",
           "captured": "knight",
           "check": false,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2R4K b - - 0 3"
          }
         ],
         "ended": false,
         "paid": true,
         "net": 6,
         "lost": {
          "square": "c1",
          "piece": "queen",
          "color": "white"
         },
         "lostFor": "knight"
        },
        "gain": -6,
        "betterGain": 3,
        "betterReason": {
         "kind": "wins",
         "square": "d4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.357647315572,
        "winPctAfter": 5.943709526487311,
        "depth": 1
       },
       "traits": [
        "lost-queen",
        "answer-check"
       ]
      },
      {
       "patternId": "hung-piece",
       "gameId": "lichess:fxothr01",
       "ply": 1,
       "winPctLoss": 88.41393778908468,
       "fen": "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1",
       "played": "Qc1",
       "best": "Qxd4",
       "story": {
        "played": {
         "san": "Qc1",
         "uci": "d2c1",
         "from": "d2",
         "to": "c1",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne2+",
          "uci": "d4e2",
          "from": "d4",
          "to": "e2",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
         },
         {
          "san": "Kh1",
          "uci": "g1h1",
          "from": "g1",
          "to": "h1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2R1K b - - 3 2"
         },
         {
          "san": "Nxc1",
          "uci": "e2c1",
          "from": "e2",
          "to": "c1",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2n2R1K w - - 0 3"
         },
         {
          "san": "Rxc1",
          "uci": "f1c1",
          "from": "f1",
          "to": "c1",
          "piece": "rook",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2R4K b - - 0 3"
         }
        ],
        "replyFound": false,
        "actualReply": {
         "san": "Rad8",
         "uci": "a8d8",
         "from": "a8",
         "to": "d8",
         "piece": "rook",
         "color": "black",
         "check": false,
         "mate": false,
         "fenAfter": "3r1rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 w - - 2 2"
        },
        "followed": 0,
        "better": [
         {
          "san": "Qxd4",
          "uci": "d2d4",
          "from": "d2",
          "to": "d4",
          "piece": "queen",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/3Q4/8/PPP2PPP/5RK1 b - - 0 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "g1",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "c1",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "c1",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [
          {
           "san": "Rad8",
           "uci": "a8d8",
           "from": "a8",
           "to": "d8",
           "piece": "rook",
           "color": "black",
           "check": false,
           "mate": false,
           "fenAfter": "3r1rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 w - - 2 2"
          }
         ],
         "ended": false,
         "paid": false
        },
        "gain": -6,
        "betterGain": 3,
        "betterReason": {
         "kind": "wins",
         "square": "d4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.357647315572,
        "winPctAfter": 5.943709526487311,
        "depth": 1
       },
       "traits": [
        "lost-queen"
       ]
      }
     ],
     "blindSpots": [
      {
       "id": "lost-queen",
       "basis": "line",
       "count": 7,
       "games": 6,
       "of": 19,
       "baselineCount": 20,
       "baselineOf": 230,
       "examples": []
      }
     ],
     "blindSpotWindow": {
      "start": "2026-10-26T00:00:00.000Z",
      "end": "2026-12-07T00:00:00.000Z",
      "games": 96,
      "mistakes": 230
     },
     "steps": [
      {
       "blindSpot": "lost-queen",
       "text": "When the move is a queen move, slow down. Name one safe square for her after their best reply."
      }
     ],
     "goal": {
      "per": 1,
      "of": 5
     }
    }
   ],
   "progress": [],
   "retired": [],
   "summary": "Over {games} games you made about {mistakesPerGame} mistakes a game.",
   "wording": {
    "source": "model",
    "provider": "anthropic",
    "model": "stub-model",
    "wordedFor": [
     "allowed-tactic",
     "hung-piece"
    ],
    "calls": 1
   },
   "notes": []
  },
  {
   "player": "tidy_rookling",
   "track": {
    "platform": "lichess",
    "username": "tidy_rookling",
    "timeClass": "rapid"
   },
   "kind": "weekly",
   "revision": 1,
   "periodStart": "2026-11-30T00:00:00.000Z",
   "periodEnd": "2026-12-07T00:00:00.000Z",
   "rating": 1240,
   "band": "club",
   "bandSource": "ratings",
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "gamesFound": 18,
   "gamesAnalyzed": 18,
   "gameIds": [
    "lichess:fxpart01",
    "lichess:fxend001",
    "lichess:fxfoll01",
    "lichess:fxothr01"
   ],
   "coverage": {
    "sampled": 18,
    "analysed": 18,
    "total": 18,
    "complete": true,
    "sampleOnly": false,
    "checked": 18
   },
   "current": {
    "start": "2026-11-30T00:00:00.000Z",
    "end": "2026-12-07T00:00:00.000Z",
    "games": 18,
    "moves": 630,
    "mistakesPer100Moves": 9.8,
    "settings": {
     "analysisVersion": 2,
     "patternsVersion": 1,
     "engine": {
      "name": "Stub 1",
      "depth": 12
     },
     "checkDepth": 18
    },
    "stats": [
     {
      "patternId": "missed-mate",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "allowed-mate",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "hung-piece",
      "games": 18,
      "moves": 630,
      "gamesAffected": 4,
      "occurrences": 5,
      "per100Moves": 0.79,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "allowed-tactic",
      "games": 18,
      "moves": 630,
      "gamesAffected": 5,
      "occurrences": 6,
      "per100Moves": 0.95,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "missed-capture",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "missed-tactic",
      "games": 18,
      "moves": 630,
      "gamesAffected": 3,
      "occurrences": 4,
      "per100Moves": 0.63,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "thrown-win",
      "games": 18,
      "moves": 630,
      "gamesAffected": 2,
      "occurrences": 3,
      "per100Moves": 0.48,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "time-trouble",
      "games": 18,
      "moves": 630,
      "gamesAffected": 1,
      "occurrences": 2,
      "per100Moves": 0.32,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "opening-trouble",
      "games": 18,
      "moves": 630,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.16,
      "avgWinPctLoss": 30
     }
    ]
   },
   "comparison": {
    "start": "2026-11-23T00:00:00.000Z",
    "end": "2026-11-30T00:00:00.000Z",
    "games": 69,
    "moves": 2415,
    "mistakesPer100Moves": 9.8,
    "settings": {
     "analysisVersion": 2,
     "patternsVersion": 1,
     "engine": {
      "name": "Stub 1",
      "depth": 12
     },
     "checkDepth": 18
    },
    "stats": [
     {
      "patternId": "missed-mate",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.04,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "allowed-mate",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.04,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "hung-piece",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 4,
      "occurrences": 5,
      "per100Moves": 0.21,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "allowed-tactic",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 5,
      "occurrences": 6,
      "per100Moves": 0.25,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "missed-capture",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.04,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "missed-tactic",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 3,
      "occurrences": 4,
      "per100Moves": 0.17,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "thrown-win",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 2,
      "occurrences": 3,
      "per100Moves": 0.12,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "time-trouble",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 1,
      "occurrences": 2,
      "per100Moves": 0.08,
      "avgWinPctLoss": 30
     },
     {
      "patternId": "opening-trouble",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 0,
      "occurrences": 1,
      "per100Moves": 0.04,
      "avgWinPctLoss": 30
     }
    ]
   },
   "weeks": [
    {
     "start": "2026-11-30T00:00:00.000Z",
     "end": "2026-12-07T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-23T00:00:00.000Z",
     "end": "2026-11-30T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-16T00:00:00.000Z",
     "end": "2026-11-23T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-09T00:00:00.000Z",
     "end": "2026-11-16T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-11-02T00:00:00.000Z",
     "end": "2026-11-09T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    },
    {
     "start": "2026-10-26T00:00:00.000Z",
     "end": "2026-11-02T00:00:00.000Z",
     "games": 15,
     "moves": 525,
     "mistakesPer100Moves": 9.8,
     "settings": {
      "analysisVersion": 2,
      "patternsVersion": 1,
      "engine": {
       "name": "Stub 1",
       "depth": 12
      },
      "checkDepth": 18
     },
     "stats": [
      {
       "patternId": "missed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-mate",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "hung-piece",
       "games": 15,
       "moves": 525,
       "gamesAffected": 4,
       "occurrences": 5,
       "per100Moves": 0.95,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "allowed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 5,
       "occurrences": 6,
       "per100Moves": 1.14,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-capture",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "missed-tactic",
       "games": 15,
       "moves": 525,
       "gamesAffected": 3,
       "occurrences": 4,
       "per100Moves": 0.76,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "thrown-win",
       "games": 15,
       "moves": 525,
       "gamesAffected": 2,
       "occurrences": 3,
       "per100Moves": 0.57,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "time-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 1,
       "occurrences": 2,
       "per100Moves": 0.38,
       "avgWinPctLoss": 30
      },
      {
       "patternId": "opening-trouble",
       "games": 15,
       "moves": 525,
       "gamesAffected": 0,
       "occurrences": 1,
       "per100Moves": 0.19,
       "avgWinPctLoss": 30
      }
     ]
    }
   ],
   "trends": [],
   "priorities": [],
   "focus": [
    {
     "patternId": "allowed-tactic",
     "title": "Moves that let a fork in",
     "why": "In {gamesAffected} of your {games} games a move of yours handed the other side something for free.",
     "drill": "Before each move, look for the opponent's checks, captures and double attacks.",
     "exampleGameIds": [
      "lichess:fxpart01",
      "lichess:fxend001"
     ],
     "baseline": {
      "patternId": "allowed-tactic",
      "games": 64,
      "moves": 2240,
      "gamesAffected": 22,
      "occurrences": 23,
      "per100Moves": 1.03,
      "avgWinPctLoss": 30
     },
     "target": 0.96,
     "since": "2026-11-16T00:00:00.000Z",
     "reason": {
      "kind": "kept",
      "previousRank": 1,
      "score": 10,
      "recentCost": 5,
      "naiveCostThisPeriod": 5,
      "rate": 1,
      "severity": 30,
      "chronicity": 0.8,
      "weeksRecurred": 6,
      "weeksCounted": 6,
      "weeks": [
       true,
       true,
       true,
       true,
       true,
       true
      ]
     },
     "examples": [
      {
       "patternId": "allowed-tactic",
       "gameId": "lichess:fxpart01",
       "ply": 1,
       "winPctLoss": 68.53127023839994,
       "motif": "fork",
       "fen": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1",
       "played": "Qd2",
       "best": "Re1",
       "story": {
        "played": {
         "san": "Qd2",
         "uci": "d1d2",
         "from": "d1",
         "to": "d2",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne4+",
          "uci": "f6e4",
          "from": "f6",
          "to": "e4",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
         },
         {
          "san": "Ke1",
          "uci": "f2e1",
          "from": "f2",
          "to": "e1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ2PP/R3K2R b - - 3 2"
         },
         {
          "san": "Nxd2",
          "uci": "e4d2",
          "from": "e4",
          "to": "d2",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPn2PP/R3K2R w - - 0 3"
         },
         {
          "san": "Kxd2",
          "uci": "e1d2",
          "from": "e1",
          "to": "d2",
          "piece": "king",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPK2PP/R6R b - - 0 3"
         }
        ],
        "replyFound": true,
        "actualReply": {
         "san": "Ne4+",
         "uci": "f6e4",
         "from": "f6",
         "to": "e4",
         "piece": "knight",
         "color": "black",
         "check": true,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
        },
        "followed": 2,
        "better": [
         {
          "san": "Re1",
          "uci": "h1e1",
          "from": "h1",
          "to": "e1",
          "piece": "rook",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2QR3 b - - 1 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "f2",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "d2",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "d2",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [
          {
           "san": "Ne4+",
           "uci": "f6e4",
           "from": "f6",
           "to": "e4",
           "piece": "knight",
           "color": "black",
           "check": true,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
          }
         ],
         "ended": false,
         "paid": false
        },
        "gain": -6,
        "betterGain": 0,
        "betterReason": {
         "kind": "covers-square",
         "square": "e4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.60714585480221,
        "winPctAfter": 26.07587561640227,
        "depth": 1
       },
       "traits": [
        "answer-check",
        "answer-fork"
       ]
      },
      {
       "patternId": "allowed-tactic",
       "gameId": "lichess:fxend001",
       "ply": 1,
       "winPctLoss": 68.53127023839994,
       "motif": "fork",
       "fen": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2Q3R w - - 0 1",
       "played": "Qd2",
       "best": "Re1",
       "story": {
        "played": {
         "san": "Qd2",
         "uci": "d1d2",
         "from": "d1",
         "to": "d2",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPPQ1KPP/R6R b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne4+",
          "uci": "f6e4",
          "from": "f6",
          "to": "e4",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ1KPP/R6R w - - 2 2"
         },
         {
          "san": "Ke1",
          "uci": "f2e1",
          "from": "f2",
          "to": "e1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/4n3/8/PPPQ2PP/R3K2R b - - 3 2"
         },
         {
          "san": "Nxd2",
          "uci": "e4d2",
          "from": "e4",
          "to": "d2",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPn2PP/R3K2R w - - 0 3"
         },
         {
          "san": "Kxd2",
          "uci": "e1d2",
          "from": "e1",
          "to": "d2",
          "piece": "king",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPPK2PP/R6R b - - 0 3"
         }
        ],
        "replyFound": false,
        "followed": 0,
        "better": [
         {
          "san": "Re1",
          "uci": "h1e1",
          "from": "h1",
          "to": "e1",
          "piece": "rook",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/5n2/8/8/8/PPP2KPP/R2QR3 b - - 1 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "f2",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "d2",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "d2",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [],
         "ended": true,
         "paid": false
        },
        "gain": -6,
        "betterGain": 0,
        "betterReason": {
         "kind": "covers-square",
         "square": "e4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.60714585480221,
        "winPctAfter": 26.07587561640227,
        "depth": 1
       },
       "traits": [
        "answer-check",
        "moved-piece-lost"
       ]
      }
     ],
     "blindSpots": [
      {
       "id": "answer-check",
       "basis": "line",
       "count": 11,
       "games": 10,
       "of": 27,
       "baselineCount": 29,
       "baselineOf": 230,
       "refinement": {
        "id": "answer-knight-check",
        "count": 6
       },
       "examples": []
      },
      {
       "id": "moved-piece-lost",
       "basis": "line",
       "count": 10,
       "games": 9,
       "of": 27,
       "baselineCount": 52,
       "baselineOf": 230,
       "examples": []
      }
     ],
     "blindSpotWindow": {
      "start": "2026-10-26T00:00:00.000Z",
      "end": "2026-12-07T00:00:00.000Z",
      "games": 96,
      "mistakes": 230
     },
     "steps": [
      {
       "blindSpot": "answer-check",
       "text": "Before you let go of the piece, find every check they would have, knight checks first."
      },
      {
       "blindSpot": "moved-piece-lost",
       "text": "Look at the square you are moving to. Count what attacks the piece there and what guards it."
      }
     ],
     "goal": {
      "per": 1,
      "of": 4
     }
    },
    {
     "patternId": "hung-piece",
     "title": "Pieces left to be taken",
     "why": "In {gamesAffected} of your {games} games a move of yours handed the other side something for free.",
     "drill": "Before each move, look for the opponent's checks, captures and double attacks.",
     "exampleGameIds": [
      "lichess:fxfoll01",
      "lichess:fxothr01"
     ],
     "baseline": {
      "patternId": "hung-piece",
      "games": 64,
      "moves": 2240,
      "gamesAffected": 16,
      "occurrences": 17,
      "per100Moves": 0.76,
      "avgWinPctLoss": 30
     },
     "target": 0.96,
     "since": "2026-11-16T00:00:00.000Z",
     "reason": {
      "kind": "new",
      "previousRank": null,
      "score": 10,
      "recentCost": 5,
      "naiveCostThisPeriod": 5,
      "rate": 1,
      "severity": 30,
      "chronicity": 0.8,
      "weeksRecurred": 4,
      "weeksCounted": 5,
      "weeks": [
       true,
       true,
       false,
       true,
       true,
       null
      ]
     },
     "examples": [
      {
       "patternId": "hung-piece",
       "gameId": "lichess:fxfoll01",
       "ply": 1,
       "winPctLoss": 88.41393778908468,
       "fen": "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1",
       "played": "Qc1",
       "best": "Qxd4",
       "story": {
        "played": {
         "san": "Qc1",
         "uci": "d2c1",
         "from": "d2",
         "to": "c1",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne2+",
          "uci": "d4e2",
          "from": "d4",
          "to": "e2",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
         },
         {
          "san": "Kh1",
          "uci": "g1h1",
          "from": "g1",
          "to": "h1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2R1K b - - 3 2"
         },
         {
          "san": "Nxc1",
          "uci": "e2c1",
          "from": "e2",
          "to": "c1",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2n2R1K w - - 0 3"
         },
         {
          "san": "Rxc1",
          "uci": "f1c1",
          "from": "f1",
          "to": "c1",
          "piece": "rook",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2R4K b - - 0 3"
         }
        ],
        "replyFound": true,
        "actualReply": {
         "san": "Ne2+",
         "uci": "d4e2",
         "from": "d4",
         "to": "e2",
         "piece": "knight",
         "color": "black",
         "check": true,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
        },
        "followed": 4,
        "better": [
         {
          "san": "Qxd4",
          "uci": "d2d4",
          "from": "d2",
          "to": "d4",
          "piece": "queen",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/3Q4/8/PPP2PPP/5RK1 b - - 0 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "g1",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "c1",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "c1",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [
          {
           "san": "Ne2+",
           "uci": "d4e2",
           "from": "d4",
           "to": "e2",
           "piece": "knight",
           "color": "black",
           "check": true,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
          },
          {
           "san": "Kh1",
           "uci": "g1h1",
           "from": "g1",
           "to": "h1",
           "piece": "king",
           "color": "white",
           "check": false,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2R1K b - - 3 2"
          },
          {
           "san": "Nxc1",
           "uci": "e2c1",
           "from": "e2",
           "to": "c1",
           "piece": "knight",
           "color": "black",
           "captured": "queen",
           "check": false,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2n2R1K w - - 0 3"
          },
          {
           "san": "Rxc1",
           "uci": "f1c1",
           "from": "f1",
           "to": "c1",
           "piece": "rook",
           "color": "white",
           "captured": "knight",
           "check": false,
           "mate": false,
           "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2R4K b - - 0 3"
          }
         ],
         "ended": false,
         "paid": true,
         "net": 6,
         "lost": {
          "square": "c1",
          "piece": "queen",
          "color": "white"
         },
         "lostFor": "knight"
        },
        "gain": -6,
        "betterGain": 3,
        "betterReason": {
         "kind": "wins",
         "square": "d4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.357647315572,
        "winPctAfter": 5.943709526487311,
        "depth": 1
       },
       "traits": [
        "lost-queen",
        "answer-check"
       ]
      },
      {
       "patternId": "hung-piece",
       "gameId": "lichess:fxothr01",
       "ply": 1,
       "winPctLoss": 88.41393778908468,
       "fen": "r4rk1/ppp2ppp/8/8/3n4/8/PPPQ1PPP/5RK1 w - - 0 1",
       "played": "Qc1",
       "best": "Qxd4",
       "story": {
        "played": {
         "san": "Qc1",
         "uci": "d2c1",
         "from": "d2",
         "to": "c1",
         "piece": "queen",
         "color": "white",
         "check": false,
         "mate": false,
         "fenAfter": "r4rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 b - - 1 1"
        },
        "punish": [
         {
          "san": "Ne2+",
          "uci": "d4e2",
          "from": "d4",
          "to": "e2",
          "piece": "knight",
          "color": "black",
          "check": true,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2RK1 w - - 2 2"
         },
         {
          "san": "Kh1",
          "uci": "g1h1",
          "from": "g1",
          "to": "h1",
          "piece": "king",
          "color": "white",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP1nPPP/2Q2R1K b - - 3 2"
         },
         {
          "san": "Nxc1",
          "uci": "e2c1",
          "from": "e2",
          "to": "c1",
          "piece": "knight",
          "color": "black",
          "captured": "queen",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2n2R1K w - - 0 3"
         },
         {
          "san": "Rxc1",
          "uci": "f1c1",
          "from": "f1",
          "to": "c1",
          "piece": "rook",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/2R4K b - - 0 3"
         }
        ],
        "replyFound": false,
        "actualReply": {
         "san": "Rad8",
         "uci": "a8d8",
         "from": "a8",
         "to": "d8",
         "piece": "rook",
         "color": "black",
         "check": false,
         "mate": false,
         "fenAfter": "3r1rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 w - - 2 2"
        },
        "followed": 0,
        "better": [
         {
          "san": "Qxd4",
          "uci": "d2d4",
          "from": "d2",
          "to": "d4",
          "piece": "queen",
          "color": "white",
          "captured": "knight",
          "check": false,
          "mate": false,
          "fenAfter": "r4rk1/ppp2ppp/8/8/3Q4/8/PPP2PPP/5RK1 b - - 0 1"
         }
        ],
        "key": {
         "line": "punish",
         "index": 0
        },
        "targets": [
         {
          "square": "g1",
          "piece": "king",
          "color": "white"
         },
         {
          "square": "c1",
          "piece": "queen",
          "color": "white"
         }
        ],
        "lost": {
         "square": "c1",
         "piece": "queen",
         "color": "white"
        },
        "lostFor": "knight",
        "inGame": {
         "moves": [
          {
           "san": "Rad8",
           "uci": "a8d8",
           "from": "a8",
           "to": "d8",
           "piece": "rook",
           "color": "black",
           "check": false,
           "mate": false,
           "fenAfter": "3r1rk1/ppp2ppp/8/8/3n4/8/PPP2PPP/2Q2RK1 w - - 2 2"
          }
         ],
         "ended": false,
         "paid": false
        },
        "gain": -6,
        "betterGain": 3,
        "betterReason": {
         "kind": "wins",
         "square": "d4",
         "piece": "knight",
         "gain": 3
        },
        "winPctBefore": 94.357647315572,
        "winPctAfter": 5.943709526487311,
        "depth": 1
       },
       "traits": [
        "lost-queen"
       ]
      }
     ],
     "blindSpots": [
      {
       "id": "lost-queen",
       "basis": "line",
       "count": 7,
       "games": 6,
       "of": 19,
       "baselineCount": 20,
       "baselineOf": 230,
       "examples": []
      }
     ],
     "blindSpotWindow": {
      "start": "2026-10-26T00:00:00.000Z",
      "end": "2026-12-07T00:00:00.000Z",
      "games": 96,
      "mistakes": 230
     },
     "steps": [
      {
       "blindSpot": "lost-queen",
       "text": "When the move is a queen move, slow down. Name one safe square for her after their best reply."
      }
     ],
     "goal": {
      "per": 1,
      "of": 5
     }
    }
   ],
   "progress": [
    {
     "patternId": "allowed-tactic",
     "previous": {
      "patternId": "allowed-tactic",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 20,
      "occurrences": 21,
      "per100Moves": 0.87,
      "avgWinPctLoss": 30
     },
     "current": {
      "patternId": "allowed-tactic",
      "games": 18,
      "moves": 630,
      "gamesAffected": 5,
      "occurrences": 6,
      "per100Moves": 0.95,
      "avgWinPctLoss": 30
     },
     "verdict": "flat",
     "pValue": 0.47
    },
    {
     "patternId": "thrown-win",
     "previous": {
      "patternId": "thrown-win",
      "games": 69,
      "moves": 2415,
      "gamesAffected": 17,
      "occurrences": 18,
      "per100Moves": 0.75,
      "avgWinPctLoss": 30
     },
     "current": {
      "patternId": "thrown-win",
      "games": 18,
      "moves": 630,
      "gamesAffected": 1,
      "occurrences": 2,
      "per100Moves": 0.32,
      "avgWinPctLoss": 30
     },
     "verdict": "improved",
     "pValue": 0.03
    }
   ],
   "retired": [
    {
     "patternId": "thrown-win",
     "why": "graduated",
     "since": "2026-11-16T00:00:00.000Z",
     "baseline": {
      "patternId": "thrown-win",
      "games": 64,
      "moves": 2240,
      "gamesAffected": 16,
      "occurrences": 17,
      "per100Moves": 0.76,
      "avgWinPctLoss": 30
     },
     "current": {
      "patternId": "thrown-win",
      "games": 18,
      "moves": 630,
      "gamesAffected": 1,
      "occurrences": 2,
      "per100Moves": 0.32,
      "avgWinPctLoss": 30
     }
    }
   ],
   "summary": "Over {games} games you made about {mistakesPerGame} mistakes a game.",
   "wording": {
    "source": "model",
    "provider": "anthropic",
    "model": "stub-model",
    "wordedFor": [
     "allowed-tactic",
     "hung-piece"
    ],
    "calls": 1
   },
   "notes": []
  }
 ],
 "weeks": [
  {
   "start": "2026-11-30T00:00:00.000Z",
   "end": "2026-12-07T00:00:00.000Z",
   "games": 14,
   "moves": 490,
   "mistakesPer100Moves": 9.8,
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "stats": [
    {
     "patternId": "missed-mate",
     "games": 14,
     "moves": 490,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.2,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-mate",
     "games": 14,
     "moves": 490,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.2,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "hung-piece",
     "games": 14,
     "moves": 490,
     "gamesAffected": 4,
     "occurrences": 5,
     "per100Moves": 1.02,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-tactic",
     "games": 14,
     "moves": 490,
     "gamesAffected": 5,
     "occurrences": 6,
     "per100Moves": 1.22,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-capture",
     "games": 14,
     "moves": 490,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.2,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-tactic",
     "games": 14,
     "moves": 490,
     "gamesAffected": 3,
     "occurrences": 4,
     "per100Moves": 0.82,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "thrown-win",
     "games": 14,
     "moves": 490,
     "gamesAffected": 2,
     "occurrences": 3,
     "per100Moves": 0.61,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "time-trouble",
     "games": 14,
     "moves": 490,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.41,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "opening-trouble",
     "games": 14,
     "moves": 490,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.2,
     "avgWinPctLoss": 30
    }
   ]
  },
  {
   "start": "2026-11-23T00:00:00.000Z",
   "end": "2026-11-30T00:00:00.000Z",
   "games": 15,
   "moves": 525,
   "mistakesPer100Moves": 9.8,
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "stats": [
    {
     "patternId": "missed-mate",
     "games": 15,
     "moves": 525,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.19,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-mate",
     "games": 15,
     "moves": 525,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.19,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "hung-piece",
     "games": 15,
     "moves": 525,
     "gamesAffected": 4,
     "occurrences": 5,
     "per100Moves": 0.95,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-tactic",
     "games": 15,
     "moves": 525,
     "gamesAffected": 5,
     "occurrences": 6,
     "per100Moves": 1.14,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-capture",
     "games": 15,
     "moves": 525,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.19,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-tactic",
     "games": 15,
     "moves": 525,
     "gamesAffected": 3,
     "occurrences": 4,
     "per100Moves": 0.76,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "thrown-win",
     "games": 15,
     "moves": 525,
     "gamesAffected": 2,
     "occurrences": 3,
     "per100Moves": 0.57,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "time-trouble",
     "games": 15,
     "moves": 525,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.38,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "opening-trouble",
     "games": 15,
     "moves": 525,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.19,
     "avgWinPctLoss": 30
    }
   ]
  },
  {
   "start": "2026-11-16T00:00:00.000Z",
   "end": "2026-11-23T00:00:00.000Z",
   "games": 16,
   "moves": 560,
   "mistakesPer100Moves": 9.8,
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "stats": [
    {
     "patternId": "missed-mate",
     "games": 16,
     "moves": 560,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.18,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-mate",
     "games": 16,
     "moves": 560,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.18,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "hung-piece",
     "games": 16,
     "moves": 560,
     "gamesAffected": 4,
     "occurrences": 5,
     "per100Moves": 0.89,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-tactic",
     "games": 16,
     "moves": 560,
     "gamesAffected": 5,
     "occurrences": 6,
     "per100Moves": 1.07,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-capture",
     "games": 16,
     "moves": 560,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.18,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-tactic",
     "games": 16,
     "moves": 560,
     "gamesAffected": 3,
     "occurrences": 4,
     "per100Moves": 0.71,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "thrown-win",
     "games": 16,
     "moves": 560,
     "gamesAffected": 2,
     "occurrences": 3,
     "per100Moves": 0.54,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "time-trouble",
     "games": 16,
     "moves": 560,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.36,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "opening-trouble",
     "games": 16,
     "moves": 560,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.18,
     "avgWinPctLoss": 30
    }
   ]
  },
  {
   "start": "2026-11-09T00:00:00.000Z",
   "end": "2026-11-16T00:00:00.000Z",
   "games": 17,
   "moves": 595,
   "mistakesPer100Moves": 9.8,
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "stats": [
    {
     "patternId": "missed-mate",
     "games": 17,
     "moves": 595,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.17,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-mate",
     "games": 17,
     "moves": 595,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.17,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "hung-piece",
     "games": 17,
     "moves": 595,
     "gamesAffected": 4,
     "occurrences": 5,
     "per100Moves": 0.84,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-tactic",
     "games": 17,
     "moves": 595,
     "gamesAffected": 5,
     "occurrences": 6,
     "per100Moves": 1.01,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-capture",
     "games": 17,
     "moves": 595,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.17,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-tactic",
     "games": 17,
     "moves": 595,
     "gamesAffected": 3,
     "occurrences": 4,
     "per100Moves": 0.67,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "thrown-win",
     "games": 17,
     "moves": 595,
     "gamesAffected": 2,
     "occurrences": 3,
     "per100Moves": 0.5,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "time-trouble",
     "games": 17,
     "moves": 595,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.34,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "opening-trouble",
     "games": 17,
     "moves": 595,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.17,
     "avgWinPctLoss": 30
    }
   ]
  },
  {
   "start": "2026-11-02T00:00:00.000Z",
   "end": "2026-11-09T00:00:00.000Z",
   "games": 18,
   "moves": 630,
   "mistakesPer100Moves": 9.8,
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "stats": [
    {
     "patternId": "missed-mate",
     "games": 18,
     "moves": 630,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.16,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-mate",
     "games": 18,
     "moves": 630,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.16,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "hung-piece",
     "games": 18,
     "moves": 630,
     "gamesAffected": 4,
     "occurrences": 5,
     "per100Moves": 0.79,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-tactic",
     "games": 18,
     "moves": 630,
     "gamesAffected": 5,
     "occurrences": 6,
     "per100Moves": 0.95,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-capture",
     "games": 18,
     "moves": 630,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.16,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-tactic",
     "games": 18,
     "moves": 630,
     "gamesAffected": 3,
     "occurrences": 4,
     "per100Moves": 0.63,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "thrown-win",
     "games": 18,
     "moves": 630,
     "gamesAffected": 2,
     "occurrences": 3,
     "per100Moves": 0.48,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "time-trouble",
     "games": 18,
     "moves": 630,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.32,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "opening-trouble",
     "games": 18,
     "moves": 630,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.16,
     "avgWinPctLoss": 30
    }
   ]
  },
  {
   "start": "2026-10-26T00:00:00.000Z",
   "end": "2026-11-02T00:00:00.000Z",
   "games": 19,
   "moves": 665,
   "mistakesPer100Moves": 9.8,
   "settings": {
    "analysisVersion": 2,
    "patternsVersion": 1,
    "engine": {
     "name": "Stub 1",
     "depth": 12
    },
    "checkDepth": 18
   },
   "stats": [
    {
     "patternId": "missed-mate",
     "games": 19,
     "moves": 665,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.15,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-mate",
     "games": 19,
     "moves": 665,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.15,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "hung-piece",
     "games": 19,
     "moves": 665,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.3,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "allowed-tactic",
     "games": 19,
     "moves": 665,
     "gamesAffected": 2,
     "occurrences": 3,
     "per100Moves": 0.45,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-capture",
     "games": 19,
     "moves": 665,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.15,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "missed-tactic",
     "games": 19,
     "moves": 665,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.3,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "thrown-win",
     "games": 19,
     "moves": 665,
     "gamesAffected": 1,
     "occurrences": 2,
     "per100Moves": 0.3,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "time-trouble",
     "games": 19,
     "moves": 665,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.15,
     "avgWinPctLoss": 30
    },
    {
     "patternId": "opening-trouble",
     "games": 19,
     "moves": 665,
     "gamesAffected": 0,
     "occurrences": 1,
     "per100Moves": 0.15,
     "avgWinPctLoss": 30
    }
   ]
  }
 ]
};
