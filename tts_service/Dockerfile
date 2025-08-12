FROM python:3.10-slim
RUN apt-get update && apt-get install -y ffmpeg build-essential libxml2 libxslt1.1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5300
CMD ["python", "app.py"]
