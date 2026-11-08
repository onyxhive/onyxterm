import { useEffect, useState } from "react";
import { api } from "../api";

export interface FavoriteModel {
  command: string;
  model: string;
  label: string;
}

const FAVORITE_MODELS_SETTING = "favoriteModels";

function parsedFavorites(saved: string | undefined): FavoriteModel[] {
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isFavoriteModel) : [];
  } catch {
    return [];
  }
}

function isFavoriteModel(value: unknown): value is FavoriteModel {
  if (typeof value !== "object" || value === null) return false;
  const { command, model, label } = value as Record<string, unknown>;
  return typeof command === "string" && typeof model === "string" && typeof label === "string";
}

function isSameModel(left: FavoriteModel, right: FavoriteModel): boolean {
  return left.command === right.command && left.model === right.model;
}

export function useFavoriteModels() {
  const [favorites, setFavorites] = useState<FavoriteModel[]>([]);

  useEffect(() => {
    api.getSettings().then(
      (settings) => setFavorites(parsedFavorites(settings[FAVORITE_MODELS_SETTING])),
      () => setFavorites([]),
    );
  }, []);

  function isFavorite(candidate: FavoriteModel): boolean {
    return favorites.some((favorite) => isSameModel(favorite, candidate));
  }

  function toggle(candidate: FavoriteModel) {
    const next = isFavorite(candidate)
      ? favorites.filter((favorite) => !isSameModel(favorite, candidate))
      : [...favorites, candidate];
    setFavorites(next);
    void api.setSetting(FAVORITE_MODELS_SETTING, JSON.stringify(next));
  }

  return { favorites, isFavorite, toggle };
}
