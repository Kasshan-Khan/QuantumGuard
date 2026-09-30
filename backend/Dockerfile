# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies required for liboqs (C++ build tools, cmake, ninja)
RUN apt-get update && apt-get install -y \
    cmake \
    build-essential \
    gcc \
    git \
    libssl-dev \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Manually compile liboqs from source to drastically speed up deployment
# We disable ALL algorithms except ML-DSA (CRYSTALS-Dilithium) to save time and RAM
RUN git clone -b main https://github.com/open-quantum-safe/liboqs.git /opt/liboqs && \
    cd /opt/liboqs && \
    mkdir build && cd build && \
    cmake -GNinja -DOQS_USE_OPENSSL=ON -DBUILD_SHARED_LIBS=ON .. && \
    ninja -j 1 && ninja install && \
    echo "/usr/local/lib" > /etc/ld.so.conf.d/liboqs.conf && ldconfig

# Tell liboqs-python where to find the manually compiled shared library
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH
ENV LIBOQS_DIR=/usr/local

# Copy the requirements file into the container
COPY requirements.txt .

# Install Python dependencies (liboqs-python will detect the library and skip auto-compilation)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Expose the port FastAPI runs on
EXPOSE 8000

# Command to run the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
