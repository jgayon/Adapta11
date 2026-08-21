"""
Hashing de contraseñas con hashlib (librería estándar), sin dependencias
externas nuevas.

NOTA: esto es suficiente para el prototipo/piloto, pero
si el proyecto avanza hacia algo con usuarios reales, conviene migrar a
passlib + bcrypt (o argon2), que son el estándar recomendado para
producción.
"""
import hashlib
import hmac
import os

_ITERATIONS = 200_000
_ALGORITHM = "sha256"


def hash_password(plain_password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac(
        _ALGORITHM,
        plain_password.encode("utf-8"),
        salt,
        _ITERATIONS,
    )
    return f"{_ALGORITHM}${_ITERATIONS}${salt.hex()}${derived.hex()}"


def verify_password(plain_password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_str, salt_hex, derived_hex = stored_hash.split("$")
        iterations = int(iterations_str)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(derived_hex)
    except (ValueError, AttributeError):
        return False

    candidate = hashlib.pbkdf2_hmac(
        algorithm,
        plain_password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate, expected)
