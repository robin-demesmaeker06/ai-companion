FROM python:3.10-slim
RUN apt-get update && apt-get install -y ffmpeg build-essential
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5200
CMD ["python", "app.py"]
