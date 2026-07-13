import os
import boto3
from botocore.exceptions import ClientError
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment variables are loaded from the absolute path of the backend directory
BASE_DIR = Path(__file__).resolve().parent.parent
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_path)

def clean_env_var(val: Optional[str]) -> Optional[str]:
    if not val:
        return val
    # Remove surrounding double or single quotes
    if val.startswith('"') and val.endswith('"'):
        return val[1:-1]
    if val.startswith("'") and val.endswith("'"):
        return val[1:-1]
    return val

def get_s3_client():
    """Initializes and returns the boto3 S3 client using environment credentials."""
    access_key = clean_env_var(os.getenv("AWS_ACCESS_KEY_ID"))
    secret_key = clean_env_var(os.getenv("AWS_SECRET_ACCESS_KEY"))
    region = clean_env_var(os.getenv("AWS_DEFAULT_REGION")) or "us-east-1"
    
    if not access_key:
        access_key = "mock_aws_access_key_id"
    if not secret_key:
        secret_key = "mock_aws_secret_access_key"
        
    return boto3.client(
        's3',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region
    )

def get_s3_bucket() -> str:
    bucket = clean_env_var(os.getenv("AWS_S3_BUCKET"))
    if not bucket:
        bucket = "summarix-mock-bucket"
    return bucket

def upload_file_stream_to_s3(file_obj, key: str, content_type: str) -> bool:
    """Streams file bytes directly to AWS S3 without caching to local disk."""
    s3_client = get_s3_client()
    bucket = get_s3_bucket()
        
    try:
        s3_client.upload_fileobj(
            file_obj,
            bucket,
            key,
            ExtraArgs={"ContentType": content_type}
        )
        print(f"[S3] Uploaded stream to bucket '{bucket}' under key '{key}'.")
        return True
    except ClientError as e:
        print(f"[S3 Error] Upload failed: {e}")
        return False

def generate_s3_download_url(key: str, expires_in: int = 3600) -> Optional[str]:
    """Generates a temporary pre-signed URL for direct video streaming from S3."""
    s3_client = get_s3_client()
    bucket = get_s3_bucket()
        
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expires_in
        )
        return url
    except ClientError as e:
        print(f"[S3 Error] Generating URL failed: {e}")
        return None

def delete_s3_object(key: str) -> bool:
    """Deletes the video object from S3."""
    s3_client = get_s3_client()
    bucket = get_s3_bucket()
        
    try:
        s3_client.delete_object(Bucket=bucket, Key=key)
        print(f"[S3] Deleted object '{key}' from bucket '{bucket}'.")
        return True
    except ClientError as e:
        print(f"[S3 Error] Deletion failed: {e}")
        return False

def put_s3_object(key: str, content: str, content_type: str = "text/plain") -> bool:
    """Uploads text content directly to S3."""
    s3_client = get_s3_client()
    bucket = get_s3_bucket()
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=content.encode("utf-8"),
            ContentType=content_type
        )
        print(f"[S3] Uploaded text content to bucket '{bucket}' under key '{key}'. Status Code: 200")
        return True
    except ClientError as e:
        print(f"[S3 Error] Put object failed: {e}. Status Code: 500")
        return False

def get_s3_object(key: str) -> Optional[str]:
    """Retrieves text content directly from S3."""
    s3_client = get_s3_client()
    bucket = get_s3_bucket()
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        print(f"[S3] Retrieved object '{key}' from bucket '{bucket}'. Status Code: 200")
        return content
    except ClientError as e:
        print(f"[S3 Error] Get object failed for '{key}': {e}. Status Code: 404")
        return None
