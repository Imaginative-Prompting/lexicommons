# Flip at 90% instead of 95%

## The rule
weaveSentence: whole when known / total × 100 >= the threshold, total being the sentence's words with a lemma (a verb group's words each
count). Against exact integer arithmetic for every sentence of 1–80 such words and every known count: 0 differences.

| words in the sentence | 2 | 4 | 5 | 8 | 9 | 10 | 12 | 15 | 19 | 20 | 25 | 30 | 40 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| known to turn whole at 95% | 2 (0 unknown) | 4 (0 unknown) | 5 (0 unknown) | 8 (0 unknown) | 9 (0 unknown) | 10 (0 unknown) | 12 (0 unknown) | 15 (0 unknown) | 19 (0 unknown) | 19 (1 unknown) | 24 (1 unknown) | 29 (1 unknown) | 38 (2 unknown) |
| known to turn whole at 90% | 2 (0 unknown) | 4 (0 unknown) | 5 (0 unknown) | 8 (0 unknown) | 9 (0 unknown) | 9 (1 unknown) | 11 (1 unknown) | 14 (1 unknown) | 18 (1 unknown) | 18 (2 unknown) | 23 (2 unknown) | 27 (3 unknown) | 36 (4 unknown) |

## Woven Alice's opening (Alice’s Adventures in Wonderland: the opening; 22 sentences, 246 lemmas)

| bank (most frequent lemmas of the text) | whole at 95% | whole at 90% | newly whole |
|---|---|---|---|
| 100 | 3 | 3 | 0 |
| 120 | 4 | 4 | 0 |
| 140 | 6 | 6 | 0 |
| 160 | 7 | 7 | 0 |
| 180 | 10 | 10 | 0 |
| 200 | 12 | 12 | 0 |
| 210 | 15 | 15 | 0 |
| 220 | 19 | 19 | 0 |
| 230 | 19 | 19 | 0 |
| 240 | 20 | 20 | 0 |
| 246 | 21 | 21 | 0 |
| 400 | 21 | 21 | 0 |
| 1200 | 21 | 21 | 0 |

A learner's bank: the course's Dutch frequency list, its first N lemmas.

| bank (the list's first N) | the text's words known | whole at 95% | whole at 90% | newly whole |
|---|---|---|---|---|
| 250 | 69.3% | 0 | 1 | 1 |
| 500 | 75.4% | 1 | 2 | 1 |
| 1000 | 81.6% | 1 | 3 | 2 |
| 2000 | 87.9% | 4 | 9 | 5 |
| 3000 | 91.2% | 5 | 15 | 10 |
| 5000 | 94.3% | 11 | 17 | 6 |
| 8000 | 96.2% | 15 | 17 | 2 |
| 12000 | 96.6% | 15 | 17 | 2 |
| 20000 | 99.0% | 20 | 21 | 1 |

## The first page knowing the list's first 3000 (the first 6 paragraphs; Dutch in bold)

- (0/0 = NaN%, the same both ways) I
- (2/3 = 66.7%, the same both ways) **In** **het** Rabbit-Hole
- **NEWLY WHOLE at 90** (51/55 = 92.7%):
  - at 95: Alice **was** **aan het beginnen** **te** **worden** **erg** **moe** **van** **zitten** **naast** **haar** **zus** **op** **de** bank, **en** **van** **hebben** **niets** **te** **doen:** **eenmaal** **of** twice **ze** **had** **gekeken** **in** **het** **boek** **haar** **zus** **was** **aan het lezen,** **maar** **het** **had** **geen** pictures **of** **gesprekken** **in** **er,** **“en** **wat** **is** **het** **nut** **van** **een** **boek,”** **dacht** Alice **“zonder** pictures **of** **gesprekken?”**
  - at 90: **Alice** **begon** **erg** **moe** **te** **worden** **van** **het** **zitten** **naast** **haar** **zus** **op** **de** **oever** **en** **van** **het** **feit** **dat** **ze** **niets** **te** **doen** **had:** **een** **of** **twee** **keer** **had** **ze** **even** **in** **het** **boek** **gekeken** **dat** **haar** **zus** **aan** **het** **lezen** **was,** **maar** **er** **stonden** **geen** **plaatjes** **of** **gesprekken** **in,** **“en** **wat** **is** **het** **nut** **van** **een** **boek,”** **dacht** **Alice** **“zonder** **plaatjes** **of** **gesprekken?”**
  - its unknown words: "bank," → oever, (oever), "twice" → tweemaal (tweemaal), "pictures" → plaatjes (plaatje), "pictures" → plaatjes (plaatje)
- **NEWLY WHOLE at 90** (50/55 = 90.9%):
  - at 95: **Dus** **ze** **was** **aan het nadenken** **bij zichzelf** **(zo** **goed** **als** **ze** **kon,** **want** **de** **hete** **dag** **liet** **haar** **zich voelen** **erg** sleepy **en** stupid), **of** **het** **plezier** **van** **maken** **een** daisy-chain **zou** **zijn** **waard** **de** **moeite** **van** **opstaan** **en** picking **de** daisies, **toen** **plotseling** **een** **Wit** **Konijn** **met** **roze** **ogen** **rende** **vlak** **langs** **haar.**
  - at 90: **Dus** **vroeg** **ze** **zich** **bij** **zichzelf** **af** **(zo** **goed** **als** **ze** **kon,** **want** **door** **de** **hete** **dag** **voelde** **ze** **zich** **erg** **slaperig** **en** **suf)** **of** **het** **plezier** **van** **het** **maken** **van** **een** **madeliefjesketting** **zou** **opwegen** **tegen** **de** **moeite** **om** **op** **te** **staan** **en** **de** **madeliefjes** **te** **plukken,** **toen** **er** **plotseling** **een** **Wit** **Konijn** **met** **roze** **ogen** **vlak** **langs** **haar** **rende.**
  - its unknown words: "sleepy" → slaperig (slaperig), "stupid)," → suf), (suf), "daisy-chain" → madeliefjesketting (madeliefjesketting), "picking" → plukken (plukken), "daisies," → madeliefjes, (madeliefje)
- **NEWLY WHOLE at 90** (24/26 = 92.3%):
  - at 95: **Er** **was** **niets** **zo** **heel** remarkable **aan** **dat;** nor did Alice **vond** **het** **zo** **heel** **erg** **ongewoon** **te** **horen** **het** **Konijn** **zeggen** **tegen** **zichzelf,** **“O** **jee!**
  - at 90: **Daar** **was** **niets** **zo** **heel** **opmerkelijks** **aan;** **evenmin** **vond** **Alice** **het** **zo** **heel** **erg** **ongewoon** **om** **het** **Konijn** **tegen** **zichzelf** **te** **horen** **zeggen:** **“O** **jee!**
  - its unknown words: "remarkable" → opmerkelijks (opmerkelijk), "nor" → evenmin (evenmin)
- (2/2 = 100.0%, whole both ways) **O** **jee!**
- **NEWLY WHOLE at 90** (97/106 = 91.5%):
  - at 95: **Ik** **zal** **zijn** **te laat!”** **(toen** **ze** **erover nadacht** afterwards, **het** **kwam op** **bij** **haar** **dat** **ze** **zou moeten** to **hebben** **zich verbaasd** **over** **dit,** **maar** **op dat moment** **het** **allemaal** **leek** **heel** **normaal);** **maar** **toen** **het** **Konijn** **echt** **haalde** **een** **horloge** **uit** **zijn** waistcoat-pocket, **en** **keek** **ernaar,** **en** **toen** hurried on, Alice **sprong overeind,** **want** **het** **schoot** **door** **haar** **hoofd** **dat** **ze** **had** **nooit** **eerder** **gezien** **een** **konijn** **met** **óf** **een** waistcoat-pocket, **óf** **een** **horloge** **te** **halen** **eruit,** **en** **brandend** **van** curiosity, **ze** **rende** **over** **het** **veld** after **er,** **en** **gelukkig** **was** **net** **op** **tijd** **te** **zien** **het** **schieten** **in** **een** **groot** rabbit-hole **onder** **de** hedge.
  - at 90: **Ik** **zal** **te** **laat** **zijn!”** **(toen** **ze** **er** **achteraf** **over** **nadacht,** **kwam** **het** **bij** **haar** **op** **dat** **ze** **zich** **hierover** **had** **moeten** **verbazen,** **maar** **op** **dat** **moment** **leek** **het** **allemaal** **heel** **normaal);** **maar** **toen** **het** **Konijn** **echt** **een** **horloge** **uit** **zijn** **vestzak** **haalde,** **ernaar** **keek** **en** **zich** **toen** **verder** **haastte,** **sprong** **Alice** **overeind,** **want** **het** **schoot** **door** **haar** **hoofd** **dat** **ze** **nog** **nooit** **eerder** **een** **konijn** **had** **gezien** **met** **óf** **een** **vestzak** **óf** **een** **horloge** **om** **eruit** **te** **halen,** **en** **brandend** **van** **nieuwsgierigheid** **rende** **ze** **er** **over** **het** **veld** **achteraan,** **en** **gelukkig** **was** **ze** **net** **op** **tijd** **om** **het** **in** **een** **groot** **konijnenhol** **onder** **de** **heg** **te** **zien** **schieten.**
  - its unknown words: "afterwards," → achteraf, (achteraf), "waistcoat-pocket," → vestzak, (vestzak), "hurried" → zich haastte (haasten), "on," → verder, (verder), "waistcoat-pocket," → vestzak, (vestzak), "curiosity," → nieuwsgierigheid, (nieuwsgierigheid), "after" → achteraan (achteraan), "rabbit-hole" → konijnenhol (konijnenhol), "hedge." → heg. (heg)
- **NEWLY WHOLE at 90** (18/19 = 94.7%):
  - at 95: **Een ogenblik later** **naar beneden** **ging** Alice after **er,** **zonder ook maar één keer te bedenken** **hoe** **in vredesnaam** **ze** **moest** to **komen** **uit** **weer.**
  - at 90: **Een** **ogenblik** **later** **ging** **Alice** **erachteraan** **naar** **beneden,** **zonder** **ook** **maar** **één** **keer** **te** **bedenken** **hoe** **ze** **er** **in** **vredesnaam** **weer** **uit** **moest** **komen.**
  - its unknown word: "after" → achteraan (achteraan)

5 sentence(s) on this page turn whole at 90 that didn't at 95.
