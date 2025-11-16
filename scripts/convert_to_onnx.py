#!/usr/bin/env python3
"""
Convert sentence-transformers model to ONNX format

This script downloads the all-MiniLM-L6-v2 model from HuggingFace and converts
it to ONNX format for use with the Context-MCP embedding engine.

Requirements:
    pip install sentence-transformers optimum[onnxruntime] onnx

Usage:
    python scripts/convert_to_onnx.py
"""

import sys
from pathlib import Path
import shutil

def check_dependencies():
    """Check if required packages are installed"""
    required = {
        'sentence_transformers': 'sentence-transformers',
        'optimum': 'optimum[onnxruntime]',
        'onnx': 'onnx',
    }

    missing = []
    for module, package in required.items():
        try:
            __import__(module)
        except ImportError:
            missing.append(package)

    if missing:
        print("ERROR: Missing required packages:")
        for package in missing:
            print(f"  - {package}")
        print("\nInstall them with:")
        print(f"  pip install {' '.join(missing)}")
        return False

    return True


def main():
    """Main conversion function"""
    if not check_dependencies():
        sys.exit(1)

    from optimum.onnxruntime import ORTModelForFeatureExtraction
    from transformers import AutoTokenizer

    model_name = "sentence-transformers/all-MiniLM-L6-v2"
    output_dir = Path("./models")

    print("=" * 60)
    print("ONNX Model Conversion for Context-MCP")
    print("=" * 60)
    print(f"\nModel: {model_name}")
    print(f"Output directory: {output_dir}")

    # Create output directory
    output_dir.mkdir(exist_ok=True)
    print(f"\n✓ Created output directory")

    # Download and convert to ONNX
    print(f"\nDownloading and converting model to ONNX...")
    print("This may take a few minutes...")

    try:
        model = ORTModelForFeatureExtraction.from_pretrained(
            model_name,
            export=True,
        )
    except Exception as e:
        print(f"\n✗ Failed to convert model: {e}")
        sys.exit(1)

    # Save ONNX model
    print(f"\nSaving ONNX model...")
    temp_dir = output_dir / "temp"
    model.save_pretrained(temp_dir)

    # Move and rename the ONNX file
    onnx_path = output_dir / "all-MiniLM-L6-v2.onnx"
    source_onnx = temp_dir / "model.onnx"

    if source_onnx.exists():
        shutil.move(str(source_onnx), str(onnx_path))
        print(f"✓ ONNX model saved to: {onnx_path}")
        print(f"  Size: {onnx_path.stat().st_size / 1024 / 1024:.1f} MB")
    else:
        print(f"\n✗ ONNX model file not found at {source_onnx}")
        sys.exit(1)

    # Download and save tokenizer
    print(f"\nDownloading tokenizer...")

    try:
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        tokenizer_path = output_dir / "tokenizer.json"

        # Save tokenizer as JSON
        tokenizer.save_pretrained(temp_dir)

        # Copy tokenizer.json to output directory
        source_tokenizer = temp_dir / "tokenizer.json"
        if source_tokenizer.exists():
            shutil.copy(str(source_tokenizer), str(tokenizer_path))
            print(f"✓ Tokenizer saved to: {tokenizer_path}")
            print(f"  Size: {tokenizer_path.stat().st_size / 1024:.1f} KB")
        else:
            print(f"\n✗ Tokenizer file not found at {source_tokenizer}")
            sys.exit(1)

    except Exception as e:
        print(f"\n✗ Failed to save tokenizer: {e}")
        sys.exit(1)

    # Clean up temporary directory
    if temp_dir.exists():
        shutil.rmtree(temp_dir)

    # Print summary
    print("\n" + "=" * 60)
    print("Conversion completed successfully!")
    print("=" * 60)
    print(f"\nModel files are ready in: {output_dir.absolute()}")
    print("\nFiles created:")
    print(f"  1. {onnx_path.name} - ONNX model")
    print(f"  2. {tokenizer_path.name} - Tokenizer configuration")
    print("\nYou can now use these files with the Context-MCP embedding engine.")
    print("\nNext steps:")
    print("  1. cargo build")
    print("  2. cargo run --example embedding_usage")


if __name__ == "__main__":
    main()
