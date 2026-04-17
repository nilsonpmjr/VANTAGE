"""Shared MongoDB utilities."""

# MongoDB supports integers up to int64 (8 bytes)
_MONGO_MAX_INT = (2 ** 63) - 1


def sanitize_for_mongo(obj):
    """Recursively convert integers that exceed MongoDB's int64 limit to strings.

    Shodan's ssl.cert.serial can be a 128-bit integer which causes
    OverflowError when Motor tries to BSON-encode it.
    """
    if isinstance(obj, dict):
        return {k: sanitize_for_mongo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_mongo(v) for v in obj]
    if isinstance(obj, int) and abs(obj) > _MONGO_MAX_INT:
        return str(obj)
    return obj
