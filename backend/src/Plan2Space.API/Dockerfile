# Build context is ./backend (the API references Domain/Application/Infrastructure).
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src
COPY src/ ./src/
RUN dotnet restore src/Plan2Space.API/Plan2Space.API.csproj
RUN dotnet publish src/Plan2Space.API/Plan2Space.API.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS production
RUN addgroup -S p2s && adduser -S p2s -G p2s
WORKDIR /app
COPY --from=build /app/publish .
USER p2s
ENV ASPNETCORE_HTTP_PORTS=5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "Plan2Space.API.dll"]
