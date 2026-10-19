package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"auto-novel/internal/domain"
	"auto-novel/internal/repository"
)

// Unused methods retain the interface but fail if a tested operation starts
// touching unrelated storage. No object store or database is contacted.
type bannerStoreFixture struct {
	repository.BannerRepository
	current domain.Banner
	writes  int
}

func (s *bannerStoreFixture) Get(context.Context, int64) (*domain.Banner, error) {
	copy := s.current
	return &copy, nil
}

func (s *bannerStoreFixture) Update(_ context.Context, _ int64, content repository.BannerContent) (*domain.Banner, error) {
	s.writes++
	s.current.LinkURL = content.LinkURL
	s.current.SortOrder = content.SortOrder
	s.current.FocalX = content.FocalX
	s.current.FocalY = content.FocalY
	return &s.current, nil
}

type bannerObjectFixture struct {
	repository.ObjectRepository
	size     int64
	requests int
}

func (s *bannerObjectFixture) PresignPut(_ context.Context, key, contentType, cacheControl string, size int64, expires time.Duration) (*repository.PresignedUpload, error) {
	s.requests++
	s.size = size
	if contentType != "image/png" || cacheControl != "public, max-age=31536000, immutable" || expires != 10*time.Minute {
		return nil, errors.New("unexpected upload contract")
	}
	return &repository.PresignedUpload{URL: "https://objects.example/" + key}, nil
}

func (*bannerObjectFixture) PublicURL(key string) string { return "https://images.example/" + key }

func TestBannerUploadLimitAndCache(t *testing.T) {
	objects := &bannerObjectFixture{}
	u := NewBannerUsecase(nil, objects)
	actor := Actor{IsAdmin: true}
	_, err := u.PresignUpload(context.Background(), actor, BannerUploadInput{ContentType: "image/png", Size: 500 * 1024})
	if err != nil || objects.requests != 1 || objects.size != 500*1024 {
		t.Fatalf("limit-sized upload should be signed once: requests=%d size=%d err=%v", objects.requests, objects.size, err)
	}
	_, err = u.PresignUpload(context.Background(), actor, BannerUploadInput{ContentType: "image/png", Size: 500*1024 + 1})
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Code != CodeBannerImageInvalid || objects.requests != 1 {
		t.Fatalf("oversized upload should fail before signing: requests=%d err=%v", objects.requests, err)
	}
}

func TestBannerMetadataUpdateCannotReplaceImage(t *testing.T) {
	store := &bannerStoreFixture{current: domain.Banner{ID: 1, Type: domain.BannerTypeHome, Key: "banners/old.webp"}}
	// No Stat implementation: metadata edits must also work for old large images
	// and must not acquire an object-store dependency.
	u := NewBannerUsecase(store, &bannerObjectFixture{})
	input := BannerInput{Type: domain.BannerTypeHome, Key: "banners/new.webp", FocalX: 0.6, FocalY: 0.5, SortOrder: 3}
	_, err := u.Update(context.Background(), Actor{IsAdmin: true}, 1, input)
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Code != CodeBannerKeyInvalid || store.writes != 0 || store.current.Key != "banners/old.webp" {
		t.Fatalf("replacement must fail without changing the saved banner: writes=%d err=%v", store.writes, err)
	}
	input.Key = store.current.Key
	result, err := u.Update(context.Background(), Actor{IsAdmin: true}, 1, input)
	if err != nil || store.writes != 1 || result.FocalX != 0.6 || result.SortOrder != 3 || result.Key != "banners/old.webp" {
		t.Fatalf("same-image metadata update should succeed: writes=%d result=%+v err=%v", store.writes, result, err)
	}
}
