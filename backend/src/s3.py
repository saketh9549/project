import os
import boto3
from botocore.exceptions import ClientError
from typing import Optional
from dotenv import load_dotenv

# Ensure environment variables are loaded (specifically for CLI or tests running this script directly)
load_dotenv()

def get_s3_client():
    """Initializes and returns the boto3 S3 client using environment credentials."""
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    if not access_key:
        access_key = "mock_aws_access_key_id"
    if not secret_key:
        secret_key = "mock_aws_secret_access_key"
    return boto3.client(
        's3',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    )

def upload_file_stream_to_s3(file_obj, key: str, content_type: str) -> bool:
    """Streams file bytes directly to AWS S3 without caching to local disk."""
    s3_client = get_s3_client()
    bucket = os.getenv("AWS_S3_BUCKET")
    if not bucket:
        bucket = "summarix-mock-bucket"
        
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
    bucket = os.getenv("AWS_S3_BUCKET")
    if not bucket:
        bucket = "summarix-mock-bucket"
        
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
    bucket = os.getenv("AWS_S3_BUCKET")
    if not bucket:
        bucket = "summarix-mock-bucket"
        
    try:
        s3_client.delete_object(Bucket=bucket, Key=key)
        print(f"[S3] Deleted object '{key}' from bucket '{bucket}'.")
        return True
    except ClientError as e:
        print(f"[S3 Error] Deletion failed: {e}")
        return False
