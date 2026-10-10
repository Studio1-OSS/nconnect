import base64

USERS = [{"id": i, "name": f"user{i}"} for i in (7, 3, 12, 1, 9, 4, 15, 2, 20, 6, 11)]

def list_users(limit=20, cursor=None):
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    after = None
    if cursor is not None:
        try:
            after = int(base64.urlsafe_b64decode(cursor.encode()).decode())
        except Exception:
            raise ValueError("bad cursor")
    ordered = sorted(USERS, key=lambda u: u["id"])
    rest = [u for u in ordered if after is None or u["id"] > after]
    page = rest[:limit]
    more = len(rest) > limit
    nxt = base64.urlsafe_b64encode(str(page[-1]["id"]).encode()).decode() if more else None
    return {"items": page, "next_cursor": nxt}
