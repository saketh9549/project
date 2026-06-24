import json
import csv
import io
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from google import genai
from google.genai import types

class QuestionModel(BaseModel):
    questionText: str
    options: List[str]
    correctAnswerIdx: int
    explanation: str = ""

class QuizModel(BaseModel):
    title: str
    questions: List[QuestionModel]

def parse_docx(file_bytes: bytes) -> str:
    """Extracts text content from a docx file bytes."""
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as docx:
            xml_content = docx.read('word/document.xml')
            root = ET.fromstring(xml_content)
            namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            paragraphs = []
            for p in root.findall('.//w:p', namespaces):
                texts = []
                for r in p.findall('.//w:t', namespaces):
                    if r.text:
                        texts.append(r.text)
                if texts:
                    paragraphs.append("".join(texts))
            return "\n".join(paragraphs)
    except Exception as e:
        print(f"[Parser] Failed to extract text from docx: {e}")
        return ""

def parse_csv(file_content: str) -> Dict[str, Any]:
    """Parses a CSV file containing questions, options, correctAnswerIdx, and optionally explanation."""
    # Expected headers: questionText, optionA, optionB, optionC, optionD, correctAnswerIdx, explanation
    # Or: Question, Option A, Option B, Option C, Option D, Correct Answer, Explanation
    # Let's try to be flexible with headers.
    reader = csv.DictReader(io.StringIO(file_content))
    questions = []
    
    for row in reader:
        # Find keys
        q_text = row.get("questionText") or row.get("Question") or row.get("question") or ""
        
        # Options
        opt_a = row.get("optionA") or row.get("Option A") or row.get("optionA") or row.get("A") or ""
        opt_b = row.get("optionB") or row.get("Option B") or row.get("optionB") or row.get("B") or ""
        opt_c = row.get("optionC") or row.get("Option C") or row.get("optionC") or row.get("C") or ""
        opt_d = row.get("optionD") or row.get("Option D") or row.get("optionD") or row.get("D") or ""
        
        options = [opt_a.strip(), opt_b.strip(), opt_c.strip(), opt_d.strip()]
        options = [o for o in options if o]
        
        if not options:
            # Fallback check for dynamic option count
            idx = 0
            while True:
                opt_val = row.get(f"option{idx}") or row.get(f"Option {idx+1}") or row.get(f"option{idx+1}")
                if opt_val is not None:
                    options.append(opt_val.strip())
                    idx += 1
                else:
                    break
                    
        correct_ans = row.get("correctAnswerIdx") or row.get("Correct Answer") or row.get("correctAnswer") or row.get("Answer") or "0"
        try:
            correct_idx = int(correct_ans)
        except ValueError:
            # Maybe it's letters like A, B, C, D
            ans_str = correct_ans.strip().upper()
            if ans_str in ('A', 'B', 'C', 'D'):
                correct_idx = ord(ans_str) - ord('A')
            else:
                correct_idx = 0
                
        explanation = row.get("explanation") or row.get("Explanation") or ""
        
        if q_text.strip() and len(options) >= 2:
            questions.append({
                "questionText": q_text.strip(),
                "options": options,
                "correctAnswerIdx": correct_idx,
                "explanation": explanation.strip()
            })
            
    return {
        "title": "Uploaded Quiz",
        "questions": questions
    }

def parse_json(file_content: str) -> Dict[str, Any]:
    """Parses JSON quiz structure."""
    data = json.loads(file_content)
    if isinstance(data, dict):
        title = data.get("title", "Uploaded Quiz")
        questions = data.get("questions", [])
    elif isinstance(data, list):
        title = "Uploaded Quiz"
        questions = data
    else:
        raise ValueError("Invalid JSON format for Quiz")
        
    formatted_questions = []
    for q in questions:
        q_text = q.get("questionText") or q.get("question") or ""
        options = q.get("options", [])
        correct_idx = q.get("correctAnswerIdx")
        if correct_idx is None:
            correct_idx = q.get("correctAnswer", 0)
        explanation = q.get("explanation", "")
        
        if q_text and isinstance(options, list) and len(options) >= 2:
            formatted_questions.append({
                "questionText": str(q_text).strip(),
                "options": [str(o).strip() for o in options],
                "correctAnswerIdx": int(correct_idx),
                "explanation": str(explanation).strip()
            })
            
    return {
        "title": title,
        "questions": formatted_questions
    }

async def parse_unstructured_with_gemini(
    file_bytes: bytes, 
    filename: str, 
    mime_type: str, 
    api_key: str, 
    model_name: str
) -> Dict[str, Any]:
    """Uses Gemini API to parse unstructured text, docx text, or PDF content into a structured quiz."""
    client = genai.Client(api_key=api_key)
    
    content_parts = []
    
    if filename.endswith(".docx"):
        text = parse_docx(file_bytes)
        if not text:
            raise ValueError("Could not extract text from the Word document.")
        content_parts.append(text)
    elif mime_type == "text/plain" or filename.endswith((".txt", ".md")):
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1")
        content_parts.append(text)
    elif mime_type == "application/pdf" or filename.endswith(".pdf"):
        content_parts.append(
            types.Part.from_bytes(data=file_bytes, mime_type="application/pdf")
        )
    else:
        try:
            text = file_bytes.decode("utf-8")
            content_parts.append(text)
        except Exception:
            raise ValueError(f"Unsupported file type: {mime_type}. Please upload a .txt, .pdf, .docx, .json, or .csv file.")
            
    prompt = (
        "Analyze the provided document and extract multiple-choice questions, answer options, "
        "the correct answer index (0-indexed, pointing to the options list), and explanations. "
        "Make sure to extract ALL questions found in the document. "
        "Formulate a descriptive title for the quiz based on its contents."
    )
    content_parts.append(prompt)
    
    # Fallback model list if the primary configured model fails or is overloaded
    models_to_try = [model_name]
    for fallback in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.1-flash-lite"]:
        if fallback != model_name:
            models_to_try.append(fallback)
            
    import asyncio
    
    last_exception = None
    for model in models_to_try:
        max_retries = 3
        delay = 1.5
        for attempt in range(max_retries):
            try:
                print(f"[Gemini Quiz Parser] Attempting parse with model={model} (attempt {attempt + 1}/{max_retries})")
                response = client.models.generate_content(
                    model=model,
                    contents=content_parts,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=QuizModel,
                        temperature=0.1
                    )
                )
                parsed_result = json.loads(response.text.strip())
                print(f"[Gemini Quiz Parser] Successfully parsed quiz using model={model}")
                return parsed_result
            except Exception as e:
                last_exception = e
                print(f"[Gemini Quiz Parser] Attempt {attempt + 1} with model={model} failed: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay)
                    delay *= 2
                else:
                    break
                    
    raise ValueError(f"Gemini failed to parse the document as a quiz: {str(last_exception)}")

