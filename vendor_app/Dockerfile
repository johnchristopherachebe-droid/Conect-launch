FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /app
COPY . .
ARG API_URL
RUN sed -i '/Create vendor account/s/\])))))); }/]))))); }/' lib/main.dart && flutter create --platforms web . && flutter pub get && flutter build web --release --dart-define=API_URL=$API_URL

FROM nginx:alpine
COPY --from=build /app/build/web /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
