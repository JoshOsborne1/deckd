from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

root = Path(r"C:/Users/Wrekin/Documents/workspace/deckd")
revk_path = root / "lib/revkCards.ts"
revk = revk_path.read_text(encoding="utf-8")
keys = re.findall(r'^  "([^"]+)": ', revk, re.M)
expected = {rank + suit for rank in "A23456789TJQK" for suit in "CDHS"}
as_xml = json.loads(re.search(r'^  "AS": (.+),$', revk, re.M).group(1))

joker_path = root / "lib/cardJokers.ts"
jokers = joker_path.read_text(encoding="utf-8")
jxml = {
    key: json.loads(re.search(r"^  " + key + r": (.+),$", jokers, re.M).group(1))
    for key in ["black", "red"]
}

face_art = (root / "components/CardFaceArtwork.tsx").read_text(encoding="utf-8")
playing_card = (root / "components/PlayingCard.tsx").read_text(encoding="utf-8")
zip_path = root / "tmp-card-deck-research/deckd-standard-52-fronts-jokers.zip"
with ZipFile(zip_path) as archive:
    names = archive.namelist()

print("front_module_count", len(keys))
print("front_missing", sorted(expected - set(keys)))
print("front_extra", sorted(set(keys) - expected))
print("AS_domain_or_credit", bool(re.search(r"(?i)(?:https?://|www\.|\.com|\.uk|revk|cards)", as_xml)))
print("joker_xml", [(key, len(value), ET.fromstring(value).attrib) for key, value in jxml.items()])
print("joker_placeholder_removed", all(token not in face_art for token in ["JOKER</Text>", "jokerMedallion"]))
print("custom_back_preserved", "if (normalized === 'back-brand') return brand.cardBack" in playing_card)
print("zip_counts", sum(name.startswith("fronts/") for name in names), sum(name.startswith("jokers/") and name.endswith(".svg") for name in names), len(names))
