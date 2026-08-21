import json
from pathlib import Path

from app.database.connection import SessionLocal
from app.models import Context, Question


BASE_DIR = Path(__file__).resolve().parents[2]

BANK_DIR = BASE_DIR / "BancoPreguntas" / "BancoSemilla" / "LC"
CONTEXTS_DIR = BANK_DIR / "LC_CTX"
QUESTIONS_DIR = BANK_DIR / "LC_Q"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def import_contexts(session):
    if not CONTEXTS_DIR.exists():
        raise FileNotFoundError(
            f"No existe la carpeta: {CONTEXTS_DIR}"
        )

    created = 0
    skipped = 0

    # Solo procesa los archivos LC_CTX_001.json, etc.
    # Ignora index.json.
    files = sorted(CONTEXTS_DIR.glob("LC_CTX_*.json"))

    if not files:
        raise FileNotFoundError(
            f"No se encontraron archivos de contextos en: {CONTEXTS_DIR}"
        )

    for path in files:
        data = load_json(path)

        context_id = data["id"]

        if session.get(Context, context_id):
            skipped += 1
            continue

        session.add(
            Context(
                id=context_id,
                title=data["title"],
                text=data["text"],
                source=data.get("source"),
            )
        )

        created += 1

    session.commit()

    return created, skipped


def import_questions(session):
    if not QUESTIONS_DIR.exists():
        raise FileNotFoundError(
            f"No existe la carpeta: {QUESTIONS_DIR}"
        )

    created = 0
    skipped = 0

    # Solo procesa LC_Q_001.json, etc.
    # Ignora index.json.
    files = sorted(QUESTIONS_DIR.glob("LC_Q_*.json"))

    if not files:
        raise FileNotFoundError(
            f"No se encontraron archivos de preguntas en: {QUESTIONS_DIR}"
        )

    for path in files:
        data = load_json(path)

        question_id = data["id"]
        context_id = data["context_id"]

        if session.get(Question, question_id):
            skipped += 1
            continue

        if not session.get(Context, context_id):
            print(
                f"ADVERTENCIA: no existe el contexto "
                f"{context_id} para {question_id}. Se omite."
            )
            continue

        session.add(
            Question(
                id=question_id,
                context_id=context_id,
                question=data["question"],
                options=data["options"],
                answer=data["answer"],
                competency=data.get("competency"),
                affirmation=data.get("affirmation"),
            )
        )

        created += 1

    session.commit()

    return created, skipped


def main():
    print("======================================")
    print(" ADAPTA-11 - Importador banco preguntas")
    print("======================================")
    print()
    print(f"Banco: {BANK_DIR}")
    print(f"Contextos: {CONTEXTS_DIR}")
    print(f"Preguntas: {QUESTIONS_DIR}")
    print()

    session = SessionLocal()

    try:
        contexts_created, contexts_skipped = import_contexts(session)

        print(
            f"Contextos: {contexts_created} nuevos, "
            f"{contexts_skipped} ya existentes."
        )

        questions_created, questions_skipped = import_questions(session)

        print(
            f"Preguntas: {questions_created} nuevas, "
            f"{questions_skipped} ya existentes."
        )

        total_contexts = session.query(Context).count()
        total_questions = session.query(Question).count()

        print()
        print("--------------------------------------")
        print(f"Total contextos en BD: {total_contexts}")
        print(f"Total preguntas en BD: {total_questions}")
        print("--------------------------------------")

        if total_contexts >= 19 and total_questions >= 49:
            print("Importación finalizada correctamente.")
        else:
            print("ADVERTENCIA: revisa las cantidades importadas.")

    except Exception:
        session.rollback()
        raise

    finally:
        session.close()


if __name__ == "__main__":
    main()