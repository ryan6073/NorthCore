from openai import OpenAI

from app.config import settings


client = OpenAI(api_key=settings.ARK_API_KEY, base_url=settings.ARK_BASE_URL)
