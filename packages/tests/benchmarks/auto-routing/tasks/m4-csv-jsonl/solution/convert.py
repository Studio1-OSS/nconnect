import csv, io, json, re

def _value(raw):
    if raw == "":
        return None
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d+\.\d+", raw):
        return float(raw)
    return raw

def convert(csv_text):
    rows = [row for row in csv.reader(io.StringIO(csv_text)) if any(cell.strip() for cell in row)]
    if not rows:
        return ""
    header = [name.strip() for name in rows[0]]
    return "\n".join(json.dumps({k: _value(v) for k, v in zip(header, row)}) for row in rows[1:])
