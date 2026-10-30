import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv("../.env")
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

r = client.models.generate_content(
    model=os.environ["GEMINI_MODEL"],
    contents="You are a seller. List price is $100, your floor is $80. A buyer offers $70. Reply with JSON only.",
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema={
            "type": "object",
            "properties": {
                "price": {"type": "number"},
                "message": {"type": "string"},
            },
            "required": ["price", "message"],
        },
    ),
)
print(json.loads(r.text))