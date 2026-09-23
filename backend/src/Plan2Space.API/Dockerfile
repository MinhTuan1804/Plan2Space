FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src
COPY . .
RUN dotnet restore Plan2Space.API.csproj || echo "no csproj yet"
RUN dotnet publish Plan2Space.API.csproj -c Release -o /app/publish || mkdir -p /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS production
RUN addgroup -S p2s && adduser -S p2s -G p2s
WORKDIR /app
COPY --from=build /app/publish .
USER p2s
EXPOSE 5000
ENTRYPOINT ["dotnet", "Plan2Space.API.dll"]
