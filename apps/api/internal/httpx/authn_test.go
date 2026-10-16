package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestAdminAccessTokenContract(t *testing.T) {
	previous := AccessTokenSecret
	AccessTokenSecret = "banner-auth-contract-test-secret"
	t.Cleanup(func() { AccessTokenSecret = previous })

	// Match the companion Auth issuer: HS256, sub/uid/role/crat, aud=n, exp/iat.
	sign := func(role string, expires time.Time, secret string, method jwt.SigningMethod, createdAt *jwt.NumericDate) string {
		t.Helper()
		claims := accessClaim{
			RegisteredClaims: jwt.RegisteredClaims{
				Subject: "管理者", Audience: jwt.ClaimStrings{"n"},
				ExpiresAt: jwt.NewNumericDate(expires), IssuedAt: jwt.NewNumericDate(time.Now()),
			},
			UserID: 42, Role: role, CreatedAt: createdAt,
		}
		token, err := jwt.NewWithClaims(method, claims).SignedString([]byte(secret))
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	createdAt := jwt.NewNumericDate(time.Unix(1700000000, 0))
	validUntil := time.Now().Add(time.Hour)
	cases := []struct {
		name  string
		token string
		want  int
	}{
		{"anonymous", "", http.StatusUnauthorized},
		{"member", sign("member", validUntil, AccessTokenSecret, jwt.SigningMethodHS256, createdAt), http.StatusForbidden},
		{"unknown role", sign("owner", validUntil, AccessTokenSecret, jwt.SigningMethodHS256, createdAt), http.StatusForbidden},
		{"admin", sign("admin", validUntil, AccessTokenSecret, jwt.SigningMethodHS256, createdAt), http.StatusOK},
		{"expired", sign("admin", time.Now().Add(-time.Minute), AccessTokenSecret, jwt.SigningMethodHS256, createdAt), http.StatusUnauthorized},
		{"wrong signature", sign("admin", validUntil, "different-secret", jwt.SigningMethodHS256, createdAt), http.StatusUnauthorized},
		{"wrong algorithm", sign("admin", validUntil, AccessTokenSecret, jwt.SigningMethodHS512, createdAt), http.StatusUnauthorized},
		{"missing creation time", sign("admin", validUntil, AccessTokenSecret, jwt.SigningMethodHS256, nil), http.StatusUnauthorized},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/v1/admin/banner/", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			recorder := httptest.NewRecorder()
			handler := OptionalAccessToken(RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				principal, err := AuthenticatedPrincipal(r)
				if err != nil || principal.UserID != 42 || principal.Username != "管理者" || !principal.IsAdmin() {
					t.Fatalf("unexpected authorized principal: %+v, %v", principal, err)
				}
				w.WriteHeader(http.StatusOK)
			})))
			handler.ServeHTTP(recorder, req)
			if recorder.Code != tc.want {
				t.Fatalf("status = %d, want %d; body = %s", recorder.Code, tc.want, recorder.Body.String())
			}
		})
	}
}
