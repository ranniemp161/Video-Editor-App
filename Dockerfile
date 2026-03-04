# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Create non-root user for security
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose Vite dev server port
EXPOSE 5173

# Run Vite dev server with host binding for Docker access
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
