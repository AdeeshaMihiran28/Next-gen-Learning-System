from app.services.intent_analyzer import analyze_transcript


def test_answer_request_without_the_is_cheating():
    report = analyze_transcript("please give me answer")

    assert report["intent"] == "CHEATING"
    assert report["score"] >= 0.9
    assert "please give me answer" in report["matches"]


def test_search_with_answer_context_is_cheating():
    report = analyze_transcript("can I search the answer online")

    assert report["intent"] == "CHEATING"


def test_plain_question_repetition_is_normal():
    report = analyze_transcript("what is database normalization")

    assert report["intent"] == "NORMAL"
